import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Sale } from '../pos/entities/sale.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { SucursalFiscal } from './entities/sucursal-fiscal.entity';
import { ProductoFiscal } from './entities/producto-fiscal.entity';
import { ReceptorFiscal } from './entities/receptor-fiscal.entity';
import { Factura, FacturaEvento, FacturaVenta, SerieFiscal, type EstadoFactura, type TipoFactura } from './entities/factura.entity';
import { PAC_PROVIDER, type PacProvider } from './pac/pac-provider';
import { PacError } from './pac/pac.types';
import { armarCfdiDesdeVenta, armarNotaCredito, TIPO_RELACION_NOTA_CREDITO, type ProductoFiscalDato } from './factura-armado';
import { USOS_CFDI } from './sat-catalogos';

// CFDI F1: facturar una venta de caja, nota de crédito, cancelación, estados y reportes — SOLO con el adaptador Mock.
// TODO comprobante queda `sinValidezFiscal = true`. El tenant sale siempre del token; un id de otro negocio responde 404.
// El cobro NUNCA depende de timbrar: este servicio no modifica ventas, turnos ni cortes.

export const SERIE_POR_DEFECTO = 'F';
export const SERIE_NOTA_CREDITO = 'NC';
const FILAS_POR_PAGINA = 15;

export interface Actor {
  email?: string;
  id?: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const quien = (a?: Actor) => a?.email ?? a?.id ?? 'desconocido';
const esDuplicado = (e: any) => e?.code === '23505';

@Injectable()
export class FacturasService {
  constructor(
    @InjectRepository(Factura) private facturas: Repository<Factura>,
    @InjectRepository(FacturaVenta) private enlaces: Repository<FacturaVenta>,
    @InjectRepository(FacturaEvento) private eventos: Repository<FacturaEvento>,
    @InjectRepository(SerieFiscal) private series: Repository<SerieFiscal>,
    @InjectRepository(EmisorFiscal) private emisores: Repository<EmisorFiscal>,
    @InjectRepository(SucursalFiscal) private sucursalesFiscal: Repository<SucursalFiscal>,
    @InjectRepository(ProductoFiscal) private productosFiscal: Repository<ProductoFiscal>,
    @InjectRepository(ReceptorFiscal) private receptores: Repository<ReceptorFiscal>,
    @InjectRepository(Sale) private ventas: Repository<Sale>,
    @InjectRepository(Branch) private branches: Repository<Branch>,
    @InjectRepository(Company) private companies: Repository<Company>,
    @Inject(PAC_PROVIDER) private pac: PacProvider,
  ) {}

  // ── factura de ingreso desde una venta de caja ──
  async crearDesdeVenta(tenantId: string, ventaId: string, input: { receptorId?: string; usoCfdi?: string }, actor?: Actor) {
    const venta = await this.ventas.findOne({ where: { id: ventaId, tenantId } });
    if (!venta) throw new NotFoundException('Venta no encontrada');

    // Candado anti-doble facturación: una venta con factura activa devuelve esa factura, no crea otra.
    const previo = await this.enlaces.findOne({ where: { tenantId, ventaId, activa: true } });
    if (previo) {
      const f = await this.facturas.findOne({ where: { id: previo.facturaId, tenantId } });
      if (f) return { ...this.resumen(f), reutilizada: true, advertencias: [] as string[] };
    }

    if (!input.receptorId) throw new BadRequestException('Elige el receptor (cliente) al que se factura.');
    const usoCfdi = String(input.usoCfdi ?? '').toUpperCase();
    if (!USOS_CFDI[usoCfdi]) throw new BadRequestException('Uso de CFDI inválido.');
    const receptor = await this.receptores.findOne({ where: { id: input.receptorId, tenantId } });
    if (!receptor) throw new NotFoundException('Receptor no encontrado');

    // El emisor se resuelve SIEMPRE desde la venta (sucursal → empresa), nunca desde un parámetro del cliente (DISENO §7.3).
    const sucursal = await this.branches.findOne({ where: { id: venta.sucursalId } });
    const empresa = sucursal ? await this.companies.findOne({ where: { id: sucursal.companyId, tenantId } }) : null;
    if (!sucursal || !empresa) throw new NotFoundException('La sucursal de la venta no pertenece a este negocio');
    const emisor = await this.emisores.findOne({ where: { tenantId, companyId: empresa.id } });
    if (!emisor) throw new UnprocessableEntityException({ message: 'Falta capturar los datos fiscales del emisor de esta empresa.', errores: ['Emisor: falta RFC, nombre fiscal y régimen.'] });
    const cp = await this.sucursalesFiscal.findOne({ where: { tenantId, branchId: sucursal.id } });
    if (!cp) throw new UnprocessableEntityException({ message: 'Falta el código postal de expedición de la sucursal.', errores: ['Sucursal: falta el código postal de expedición.'] });

    const ids = [...new Set((venta.items ?? []).map((i) => i.productoId))];
    const filas = ids.length ? await this.productosFiscal.find({ where: { tenantId, productId: In(ids) } }) : [];
    const productos = new Map<string, ProductoFiscalDato>(filas.map((p) => [p.productId, p]));

    const serie = emisor.serie || SERIE_POR_DEFECTO;
    const armado = armarCfdiDesdeVenta({
      venta: venta as any,
      emisor,
      codigoPostalExpedicion: cp.codigoPostalExpedicion,
      receptor,
      usoCfdi,
      productos,
      serie,
    });
    if (armado.errores.length || !armado.entrada) {
      throw new UnprocessableEntityException({ message: `No se puede facturar esta venta todavía. ${armado.errores.join(' ')}`, errores: armado.errores });
    }

    // La validación del proveedor corre antes de gastar un folio.
    const validacion = await this.pac.validar(armado.entrada);
    if (!validacion.ok) {
      throw new UnprocessableEntityException({ message: 'El comprobante no pasó la validación.', errores: validacion.errores.map((e) => e.mensaje) });
    }

    const intento = (await this.facturas.find({ where: { tenantId, ventaId, tipo: 'I' } })).length + 1;
    const folio = await this.reservarFolio(tenantId, empresa.id, 'I', serie);
    armado.entrada.folio = String(folio);

    const factura = await this.facturas.save(
      this.facturas.create({
        tenantId,
        companyId: empresa.id,
        tipo: 'I',
        estado: 'LISTO',
        serie,
        folio,
        receptorFiscalId: receptor.id,
        usoCfdi,
        formaPago: armado.entrada.formaPago ?? null,
        metodoPago: armado.entrada.metodoPago ?? null,
        subtotal: armado.entrada.subtotal,
        impuestos: r2(armado.entrada.total - armado.entrada.subtotal),
        total: armado.entrada.total,
        entrada: armado.entrada,
        ventaId,
        claveIdempotencia: `venta:${ventaId}:${intento}`,
        sinValidezFiscal: true,
        creadoPor: quien(actor),
      }),
    );
    try {
      await this.enlaces.save(this.enlaces.create({ tenantId, facturaId: factura.id, ventaId, importe: factura.total, activa: true }));
    } catch (e) {
      if (!esDuplicado(e)) throw e;
      // Otra solicitud ganó la carrera: se descarta esta y se devuelve la que ya existe.
      factura.estado = 'ERROR_VALIDACION';
      factura.errorMensaje = 'Duplicada: la venta ya tenía una factura activa.';
      await this.facturas.save(factura);
      const ganadora = await this.enlaces.findOne({ where: { tenantId, ventaId, activa: true } });
      const f = ganadora ? await this.facturas.findOne({ where: { id: ganadora.facturaId, tenantId } }) : null;
      if (f) return { ...this.resumen(f), reutilizada: true, advertencias: [] as string[] };
      throw new ConflictException('La venta ya tiene una factura en proceso.');
    }
    await this.evento(factura, 'CREADA', { ventaId, folioVenta: venta.folio, advertencias: armado.advertencias }, actor);

    const final = await this.timbrar(factura, actor);
    return { ...this.resumen(final), reutilizada: false, advertencias: armado.advertencias };
  }

  // PENDIENTE → TIMBRADO | ERROR_VALIDACION | INCIERTO. Un timeout NUNCA se reintenta a ciegas (ver reintentar()).
  private async timbrar(f: Factura, actor?: Actor): Promise<Factura> {
    f.estado = 'PENDIENTE';
    await this.facturas.save(f);
    await this.evento(f, 'TIMBRADO_SOLICITADO', {}, actor);
    try {
      const r = await this.pac.timbrar(f.entrada, f.claveIdempotencia);
      this.aplicarTimbrado(f, r);
      await this.facturas.save(f);
      await this.evento(f, 'TIMBRADO', { uuid: f.uuid, sinValidezFiscal: true }, actor);
    } catch (e) {
      if (e instanceof PacError && e.codigo !== 'SERVICIO_NO_DISPONIBLE') {
        f.estado = 'ERROR_VALIDACION';
        f.errorCodigo = e.codigo;
        f.errorMensaje = e.message;
        await this.facturas.save(f);
        await this.liberarVenta(f);
        await this.evento(f, 'ERROR_VALIDACION', { codigo: e.codigo }, actor);
      } else {
        f.estado = 'INCIERTO';
        f.errorCodigo = e instanceof PacError ? e.codigo : 'SIN_RESPUESTA';
        f.errorMensaje = 'No hubo respuesta del servicio de facturación. Se consultará antes de reintentar; no se vuelve a timbrar a ciegas.';
        await this.facturas.save(f);
        await this.evento(f, 'INCIERTO', { codigo: f.errorCodigo }, actor);
      }
    }
    return f;
  }

  private aplicarTimbrado(f: Factura, r: { uuid: string; fechaTimbrado: Date; xml: string }) {
    f.estado = 'TIMBRADO';
    f.uuid = r.uuid;
    f.fechaTimbrado = r.fechaTimbrado;
    f.xml = r.xml;
    f.xmlHash = createHash('sha256').update(r.xml).digest('hex');
    f.sinValidezFiscal = true; // F1: solo Mock. Un adaptador real con timbrado verdadero lo decidirá en F2.
    f.errorCodigo = null;
    f.errorMensaje = null;
  }

  /** INCIERTO: primero se consulta al proveedor por la referencia; solo si no lo tiene se reintenta con la MISMA clave. */
  async reintentar(tenantId: string, id: string, actor?: Actor) {
    const f = await this.obtenerFila(tenantId, id);
    if (f.estado !== 'INCIERTO') throw new BadRequestException('Solo se reintenta una factura en estado INCIERTO.');
    const emisor = await this.emisores.findOne({ where: { tenantId, companyId: f.companyId } });
    const ya = await this.pac.consultarPorReferencia(emisor?.rfc ?? f.entrada.emisor.rfc, f.claveIdempotencia);
    if (ya) {
      this.aplicarTimbrado(f, ya);
      await this.facturas.save(f);
      await this.evento(f, 'RECUPERADO_POR_REFERENCIA', { uuid: f.uuid }, actor);
      return this.resumen(f);
    }
    return this.resumen(await this.timbrar(f, actor));
  }

  // ── nota de crédito (egreso) ──
  async notaCredito(tenantId: string, facturaId: string, input: { partidas?: number[]; motivo?: string }, actor?: Actor) {
    const original = await this.obtenerFila(tenantId, facturaId);
    if (original.tipo !== 'I') throw new BadRequestException('Solo se emite nota de crédito sobre una factura de ingreso.');
    if (original.estado !== 'TIMBRADO' || !original.uuid) throw new BadRequestException('La factura debe estar timbrada y vigente para emitirle una nota de crédito.');
    const motivo = String(input.motivo ?? '').trim();
    if (!motivo) throw new BadRequestException('El motivo de la nota de crédito es obligatorio.');
    const partidas = Array.isArray(input.partidas) ? input.partidas.map(Number) : [];

    const previas = (await this.facturas.find({ where: { tenantId, relacionadaFacturaId: original.id, tipo: 'E' } })).filter((n) => n.estado !== 'CANCELADO' && n.estado !== 'ERROR_VALIDACION');
    const yaAcreditados = previas.flatMap((n) => n.conceptosAcreditados ?? []);
    const indices = partidas.length ? [...new Set(partidas)].sort((a, b) => a - b) : original.entrada.conceptos.map((_, i) => i);

    // Idempotencia: pedir dos veces lo mismo devuelve la nota ya emitida, no una segunda.
    const clave = `nc:${original.id}:${indices.join(',')}`;
    const igual = await this.facturas.findOne({ where: { tenantId, claveIdempotencia: clave } });
    if (igual && igual.estado !== 'ERROR_VALIDACION' && igual.estado !== 'CANCELADO') return { ...this.resumen(igual), reutilizada: true };

    const emisor = await this.emisores.findOne({ where: { tenantId, companyId: original.companyId } });
    const serie = SERIE_NOTA_CREDITO;
    const armado = armarNotaCredito({ original: original.entrada, uuidOriginal: original.uuid, indices: partidas, yaAcreditados, serie });
    if (armado.errores.length || !armado.entrada) throw new UnprocessableEntityException({ message: `No se puede emitir la nota de crédito. ${armado.errores.join(' ')}`, errores: armado.errores });

    const validacion = await this.pac.validar(armado.entrada);
    if (!validacion.ok) throw new UnprocessableEntityException({ message: 'La nota de crédito no pasó la validación.', errores: validacion.errores.map((e) => e.mensaje) });

    const folio = await this.reservarFolio(tenantId, original.companyId, 'E', serie);
    armado.entrada.folio = String(folio);
    const nota = await this.facturas.save(
      this.facturas.create({
        tenantId,
        companyId: original.companyId,
        tipo: 'E',
        estado: 'LISTO',
        serie,
        folio,
        receptorFiscalId: original.receptorFiscalId,
        usoCfdi: armado.entrada.receptor.usoCfdi,
        formaPago: original.formaPago,
        metodoPago: 'PUE',
        subtotal: armado.entrada.subtotal,
        impuestos: r2(armado.entrada.total - armado.entrada.subtotal),
        total: armado.entrada.total,
        entrada: armado.entrada,
        ventaId: original.ventaId,
        relacionadaFacturaId: original.id,
        relacionadoUuid: original.uuid,
        tipoRelacion: TIPO_RELACION_NOTA_CREDITO,
        conceptosAcreditados: indices,
        claveIdempotencia: igual ? `${clave}:${Date.now()}` : clave,
        sinValidezFiscal: true,
        creadoPor: quien(actor),
      }),
    );
    await this.evento(nota, 'CREADA', { motivo, facturaOriginal: original.id, rfcEmisor: emisor?.rfc }, actor);
    await this.evento(original, 'NOTA_CREDITO_EMITIDA', { notaId: nota.id, motivo }, actor);
    return { ...this.resumen(await this.timbrar(nota, actor)), reutilizada: false };
  }

  // ── cancelación ──
  async cancelar(tenantId: string, id: string, input: { motivo?: string; uuidSustituto?: string }, actor?: Actor) {
    const f = await this.obtenerFila(tenantId, id);
    if (f.estado !== 'TIMBRADO' || !f.uuid) throw new BadRequestException('Solo se cancela una factura timbrada.');
    const motivo = String(input.motivo ?? '');
    if (!['01', '02', '03', '04'].includes(motivo)) throw new BadRequestException('Motivo de cancelación inválido (01, 02, 03 o 04).');
    if (motivo === '01' && !input.uuidSustituto) throw new BadRequestException('El motivo 01 requiere el UUID de la factura que la sustituye.');
    const activasRelacionadas = (await this.facturas.find({ where: { tenantId, relacionadaFacturaId: f.id } })).filter((n) => n.estado === 'TIMBRADO' || n.estado === 'PENDIENTE');
    if (f.tipo === 'I' && activasRelacionadas.length) throw new BadRequestException('La factura tiene notas de crédito vigentes: cancélalas primero.');

    try {
      const r = await this.pac.cancelar(f.uuid, motivo as '01' | '02' | '03' | '04', input.uuidSustituto);
      f.motivoCancelacion = motivo;
      f.estado = r.estatus === 'Cancelado' ? 'CANCELADO' : 'CANCELACION_PENDIENTE';
      await this.facturas.save(f);
      if (f.estado === 'CANCELADO') await this.liberarVenta(f);
      await this.evento(f, f.estado === 'CANCELADO' ? 'CANCELADA' : 'CANCELACION_SOLICITADA', { motivo, requiereAceptacion: r.requiereAceptacion }, actor);
      return this.resumen(f);
    } catch (e) {
      if (e instanceof PacError) throw new ConflictException(e.message);
      throw e;
    }
  }

  /** Consulta el estatus y cierra una cancelación pendiente cuando el receptor ya aceptó. */
  async refrescarEstatus(tenantId: string, id: string, actor?: Actor) {
    const f = await this.obtenerFila(tenantId, id);
    if (!f.uuid) throw new BadRequestException('La factura todavía no tiene UUID.');
    const estatus = await this.pac.estatus(f.uuid);
    if (estatus === 'Cancelado' && f.estado !== 'CANCELADO') {
      f.estado = 'CANCELADO';
      await this.facturas.save(f);
      await this.liberarVenta(f);
      await this.evento(f, 'CANCELADA', { origen: 'consulta de estatus' }, actor);
    }
    return { ...this.resumen(f), estatusProveedor: estatus };
  }

  // ── lecturas ──
  async listar(tenantId: string, filtros: { estado?: string; tipo?: string; desde?: string; hasta?: string; pagina?: number } = {}) {
    const todas = (await this.facturas.find({ where: { tenantId } })) as Factura[];
    const dentro = (f: Factura) => {
      const dia = new Date(f.createdAt).toISOString().slice(0, 10);
      return (!filtros.estado || f.estado === filtros.estado) && (!filtros.tipo || f.tipo === filtros.tipo) && (!filtros.desde || dia >= filtros.desde) && (!filtros.hasta || dia <= filtros.hasta);
    };
    const filtradas = todas.filter(dentro).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const pagina = Math.max(1, Math.floor(Number(filtros.pagina) || 1));
    const nombres = await this.nombresReceptores(tenantId, filtradas.slice((pagina - 1) * FILAS_POR_PAGINA, pagina * FILAS_POR_PAGINA));
    return {
      total: filtradas.length,
      pagina,
      porPagina: FILAS_POR_PAGINA,
      sinValidezFiscal: true,
      filas: filtradas.slice((pagina - 1) * FILAS_POR_PAGINA, pagina * FILAS_POR_PAGINA).map((f) => ({ ...this.resumen(f), receptor: nombres.get(f.receptorFiscalId ?? '') ?? null })),
    };
  }

  async obtener(tenantId: string, id: string) {
    const f = await this.obtenerFila(tenantId, id);
    const eventos = ((await this.eventos.find({ where: { tenantId, facturaId: f.id } })) as FacturaEvento[]).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    const nombres = await this.nombresReceptores(tenantId, [f]);
    return {
      ...this.resumen(f),
      receptor: nombres.get(f.receptorFiscalId ?? '') ?? null,
      conceptos: f.entrada.conceptos,
      relacionadoUuid: f.relacionadoUuid,
      eventos: eventos.map((e) => ({ evento: e.evento, actor: e.actor, detalle: e.detalle, fecha: e.createdAt })),
    };
  }

  /** Cuadre de periodo: facturado (ingresos − notas de crédito) contra cobrado, y ventas sin factura. Todo sin validez fiscal. */
  async reporte(tenantId: string, desde: string, hasta: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '') || desde > hasta) {
      throw new BadRequestException('Indica desde y hasta como YYYY-MM-DD, con desde ≤ hasta.');
    }
    const todas = ((await this.facturas.find({ where: { tenantId } })) as Factura[]).filter((f) => {
      const dia = new Date(f.createdAt).toISOString().slice(0, 10);
      return dia >= desde && dia <= hasta;
    });
    const porEstado: Record<string, { cantidad: number; total: number }> = {};
    for (const f of todas) {
      const k = `${f.tipo}:${f.estado}`;
      porEstado[k] = { cantidad: (porEstado[k]?.cantidad ?? 0) + 1, total: r2((porEstado[k]?.total ?? 0) + Number(f.total)) };
    }
    const vigentes = todas.filter((f) => f.estado === 'TIMBRADO');
    const ingresos = r2(vigentes.filter((f) => f.tipo === 'I').reduce((s, f) => s + Number(f.total), 0));
    const egresos = r2(vigentes.filter((f) => f.tipo === 'E').reduce((s, f) => s + Number(f.total), 0));
    const cobrado = await this.totalCobrado(tenantId, desde, hasta);
    const facturado = r2(ingresos - egresos);
    return {
      desde,
      hasta,
      sinValidezFiscal: true,
      porEstado,
      facturado: { ingresos, notasDeCredito: egresos, neto: facturado },
      cobrado: { ventas: cobrado.ventas, total: cobrado.total },
      sinFacturar: { total: r2(cobrado.total - facturado) },
      conIncierto: todas.filter((f) => f.estado === 'INCIERTO').length,
      conError: todas.filter((f) => f.estado === 'ERROR_VALIDACION').length,
    };
  }

  // ── piezas internas ──
  protected async totalCobrado(tenantId: string, desde: string, hasta: string): Promise<{ ventas: number; total: number }> {
    const r = await this.ventas
      .createQueryBuilder('s')
      .select('COUNT(*)', 'n')
      .addSelect('COALESCE(SUM(s.total), 0)', 'total')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere("s.status = 'PAGADA'")
      .andWhere('s.fecha >= :desde AND s.fecha <= :hasta', { desde, hasta })
      .getRawOne();
    return { ventas: Number(r?.n ?? 0), total: r2(Number(r?.total ?? 0)) };
  }

  /** Folio consecutivo y atómico por (empresa, tipo, serie): una sola sentencia, sin carrera entre dos cajeros. */
  protected async reservarFolio(tenantId: string, companyId: string, tipo: TipoFactura, serie: string): Promise<number> {
    const filas = await this.series.query(
      `INSERT INTO fiscal_series ("tenantId","companyId","tipo","serie","folioActual") VALUES ($1,$2,$3,$4,1)
       ON CONFLICT ("companyId","tipo","serie") DO UPDATE SET "folioActual" = fiscal_series."folioActual" + 1
       RETURNING "folioActual"`,
      [tenantId, companyId, tipo, serie],
    );
    return Number(filas[0].folioActual);
  }

  private async liberarVenta(f: Factura) {
    if (f.tipo !== 'I' || !f.ventaId) return;
    const e = await this.enlaces.findOne({ where: { tenantId: f.tenantId, facturaId: f.id } });
    if (e && e.activa) {
      e.activa = false;
      await this.enlaces.save(e);
    }
  }

  private async obtenerFila(tenantId: string, id: string): Promise<Factura> {
    const f = await this.facturas.findOne({ where: { id, tenantId } });
    if (!f) throw new NotFoundException('Factura no encontrada');
    return f;
  }

  private async evento(f: Factura, evento: string, detalle: Record<string, unknown>, actor?: Actor) {
    await this.eventos.save(this.eventos.create({ tenantId: f.tenantId, facturaId: f.id, evento, detalle, actor: quien(actor) }));
  }

  private async nombresReceptores(tenantId: string, filas: Factura[]): Promise<Map<string, { rfc: string; nombreFiscal: string }>> {
    const ids = [...new Set(filas.map((f) => f.receptorFiscalId).filter((x): x is string => !!x))];
    if (!ids.length) return new Map();
    const rs = await this.receptores.find({ where: { tenantId, id: In(ids) } });
    return new Map(rs.map((r) => [r.id, { rfc: r.rfc, nombreFiscal: r.nombreFiscal }]));
  }

  /** Lo que sale por la API: nunca la entrada completa ni el XML (eso va en el detalle). Siempre marcado sin validez fiscal. */
  private resumen(f: Factura) {
    return {
      id: f.id,
      tipo: f.tipo,
      estado: f.estado as EstadoFactura,
      serie: f.serie,
      folio: f.folio,
      uuid: f.uuid,
      usoCfdi: f.usoCfdi,
      formaPago: f.formaPago,
      subtotal: Number(f.subtotal),
      impuestos: Number(f.impuestos),
      total: Number(f.total),
      fechaTimbrado: f.fechaTimbrado,
      ventaId: f.ventaId,
      relacionadaFacturaId: f.relacionadaFacturaId,
      errorMensaje: f.errorMensaje,
      sinValidezFiscal: true,
      creadaEl: f.createdAt,
    };
  }
}
