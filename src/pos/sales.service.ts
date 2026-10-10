import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm';
import { Sale, SaleItem } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { InventoryMovement } from '../costs/entities/inventory-movement.entity';
import { Branch } from '../branches/entities/branch.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { InsumoAlertsService } from './insumo-alerts.service';
import { resolveEventTimestamp } from '../common/resolve-event-timestamp.util';
import { resolveActiveInsumoChain } from '../costs/insumo-resolution';
import { NotaCocina } from './entities/nota-cocina.entity';
import { Shift } from './entities/shift.entity';
import { PoliticaDevolucion, ROLES_GERENTE } from '../config/politica-devoluciones.config';
import { ROLES_CORTESIA, ROLES_DESCUENTO, topeDescuentoPct } from '../config/roles-pos.config';
import { MembresiasCoreService } from '../membresias/membresias-core.service';
import { isValidTasaIva, montoDeItem, pesoDeItem, pesoImpuestoDeItem, tasaNumerica, totalesDeItems, TasaIva } from '../config/iva.config';

import { ActorMesas, contextoCobro, PoliticaCobro, PoliticaDivision, puedeCobrar, puedeDividir } from '../config/politicas-pos.config';

// Quien ejecuta una operación (req.user del JWT): id, email, roleCode y si la sesión es POS Lite.
type Actor = ActorMesas;
import { Table } from './entities/table.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';
import { JustifiableCategory } from '../costs/entities/justifiable.entity';

interface LowStockInsumo {
  id: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private salesRepo: Repository<Sale>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Recipe)
    private recipeRepo: Repository<Recipe>,
    @InjectRepository(Insumo)
    private insumoRepo: Repository<Insumo>,
    @InjectRepository(TenantSetting)
    private tenantSettingRepo: Repository<TenantSetting>,
    private dataSource: DataSource,
    private insumoAlertsService: InsumoAlertsService,
    // POS flexible, capacidad notas_cocina_barra: inyección de servicio normal (no un
    // algoritmo puro como resolveActiveInsumoChain, es una consulta a otra tabla) — mismo
    // patrón que AuthService ya usa con varios services de otros módulos.
    private tenantSettingsService: TenantSettingsService,
    // POS flexible, capacidad ligar_venta_a_cita: validar/completar/buscar citas reutiliza
    // AppointmentsService (misma consulta y regla de tenant del módulo de citas), no duplica
    // el acceso a la tabla "citas" desde el POS.
    private appointmentsService: AppointmentsService,
    // POS flexible, capacidad mesas_cuenta_abierta: mermas de cuentas canceladas por la vía de
    // Costos (Justifiable MERMAS_FALTANTES), no una tabla de mermas propia del POS.
    private costsService: CostsService,
    // Gimnasio, capacidad membresias: cobro y renovación de membresías, beneficio de socio y cancelación por devolución.
    // Opcional: sin el módulo de membresías el POS funciona exactamente igual.
    @Optional() private membresiasCore?: MembresiasCoreService,
  ) {}

  // POS flexible, capacidad ligar_venta_a_cita: devuelve el citaId a persistir en la venta, o
  // null. Solo consulta la capacidad cuando el body trae citaId — una venta normal no paga
  // ninguna consulta extra y queda exactamente igual. Capacidad inactiva (o sin tenant): el
  // citaId se IGNORA, sin error, igual que un campo desconocido del body.
  private async resolveCitaId(citaId: string | undefined, tenantId?: string): Promise<string | null> {
    if (!citaId || !tenantId) return null;
    const habilitada = await this.tenantSettingsService.hasPosCapability(tenantId, 'ligar_venta_a_cita');
    if (!habilitada) return null;
    // Cita de otro tenant → NotFoundException; CANCELADA → BadRequestException.
    await this.appointmentsService.assertLinkable(citaId, tenantId);
    return citaId;
  }

  // Búsqueda de citas para elegir cuál ligar antes de cobrar (GET /pos/sales/citas).
  async buscarCitasParaLigar(tenantId: string | undefined, filters: { from?: string; to?: string; paciente?: string }) {
    if (!tenantId) {
      throw new ForbiddenException('Se requiere un tenant para consultar citas.');
    }
    if (!(await this.tenantSettingsService.hasPosCapability(tenantId, 'ligar_venta_a_cita'))) {
      throw new ForbiddenException('La capacidad ligar_venta_a_cita no está activa para este negocio.');
    }
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
      throw new BadRequestException('from/to inválidos');
    }
    return this.appointmentsService.searchForPos(tenantId, { from, to, paciente: filters.paciente });
  }

  async generateFolio(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.salesRepo
      .createQueryBuilder('sale')
      .where('sale.folio LIKE :prefix', { prefix: `VTA-${today}%` })
      .getCount();
    const nextNumber = (count + 1).toString().padStart(3, '0');
    return `VTA-${today}-${nextNumber}`;
  }

  // Opcional para no romper a quien llega sin tenantId (mismo criterio que el resto del POS:
  // sin tenant no se filtra).
  private productWhere(id: string, tenantId?: string) {
    return tenantId ? { id, tenantId } : { id };
  }

  // Del cliente SOLO se toma qué producto, cuántos y el descuento por ítem (porcentaje). El precio sale del catálogo del
  // tenant y subtotal, descuento en dinero, IVA y total los calcula el servidor. El IVA es el de cada producto (tasaIva) o,
  // si no tiene, el del negocio (ivaTasaDefault); con preciosIncluyenIva el precio ya lo trae y se desglosa en vez de sumarse.
  // Antes todo eso llegaba tal cual del cliente: un mesero o un cajero podía mandar el precio o el total que quisiera.
  //  · Un producto inexistente o de otro tenant: 400 (mismo mensaje en ambos casos, no revela de quién es).
  //  · Descuento: entre 0 y 100; mayor a cero solo para ADMIN/GERENTE/CAPITAN/CAJERO (igual que PUT /discount).
  //  · Una cuenta abierta de mesa no lleva descuento por ítem: se aplica con PUT /discount.
  // El 400 "ya existe" de un folio repetido. ¿Es la MISMA venta (el primer envío sí llegó y se perdió la respuesta) o un folio
  // igual de otra? Misma = mismo tenant, sucursal, cajero y hora del evento. El motor offline solo la da por sincronizada si
  // es la misma. Solo se mira dentro del tenant de quien envía (un folio de otro tenant no se revela).
  private async errorFolioDuplicado(folio: string, d: { tenantId: string; sucursalId: string; cajero: string }, now: Date): Promise<BadRequestException> {
    const previa = await Promise.resolve().then(() => this.salesRepo.findOne({ where: { folio, tenantId: d.tenantId } })).catch(() => null);
    // `fecha` es una columna date (sin hora): la hora del evento se compara con `hora` (HH:MM:SS), ambas del servidor.
    const ymd = (v: Date | string) => {
      if (typeof v === 'string') return v.slice(0, 10);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    };
    const mismoRegistro =
      !!previa &&
      previa.sucursalId === d.sucursalId &&
      previa.cajero === d.cajero &&
      ymd(previa.fecha as any) === ymd(now) &&
      previa.hora === now.toTimeString().slice(0, 8);
    return new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: `El folio '${folio}' ya existe, no se pudo registrar la venta.`,
      code: 'FOLIO_DUPLICADO',
      mismoRegistro,
    });
  }

  private mensajeTopeDescuento(rol: string | undefined, tope: number, pedido: number): string {
    const quien = rol === 'CAJERO' ? 'un capitán o gerente' : 'un gerente o administrador';
    return `Tu rol (${rol}) puede dar hasta ${tope}% de descuento y pediste ${this.round2(pedido)}%. Pide a ${quien}.`;
  }

  // Para la revisión de ventas offline fallidas: el mismo cálculo de create(), con descuento permitido (lo resuelve un
  // gerente o admin) y sin tocar nada.
  async calcularImportesVenta(items: any[], tenantId: string, actor?: Actor) {
    return this.calcularImportes(items, tenantId, { actor, permitirDescuento: true });
  }

  private async calcularImportes(
    items: any[],
    tenantId: string,
    opts: { actor?: Actor; permitirDescuento: boolean },
  ): Promise<{ items: SaleItem[]; subtotal: number; descuento: number; impuestos: number; total: number }> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Se requiere al menos un ítem.');
    }
    const cfg = await this.tenantSettingsService.getIvaConfig(tenantId);
    const salida: SaleItem[] = [];
    for (const [i, it] of items.entries()) {
      const cantidad = Number(it?.cantidad);
      if (!it || typeof it.productoId !== 'string' || !it.productoId || !Number.isFinite(cantidad) || !(cantidad > 0)) {
        throw new BadRequestException(`Ítem ${i + 1} inválido: productoId y cantidad mayor a cero son requeridos.`);
      }
      const pct = Number(it.descuento ?? 0);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new BadRequestException(`Ítem ${i + 1} inválido: el descuento debe estar entre 0 y 100.`);
      }
      if (pct > 0) {
        if (!opts.permitirDescuento) {
          throw new BadRequestException('El descuento de una cuenta abierta se aplica con PUT /pos/sales/:id/discount.');
        }
        if (opts.actor && !ROLES_DESCUENTO.includes(opts.actor.roleCode ?? '')) {
          throw new ForbiddenException('Tu rol no puede aplicar descuentos. Pide a un capitán o gerente.');
        }
        if (opts.actor) {
          const tope = topeDescuentoPct(opts.actor.roleCode);
          if (pct > tope) {
            throw new ForbiddenException(this.mensajeTopeDescuento(opts.actor.roleCode, tope, pct));
          }
        }
      }
      const p = await this.productRepo.findOne({ where: { id: it.productoId, tenantId } });
      if (!p) throw new BadRequestException(`Producto no encontrado: ${it.productoId}`);
      const precioUnitario = this.round2(Number(p.price) || 0);
      const tasaIva: TasaIva = isValidTasaIva(p.tasaIva) ? p.tasaIva : cfg.ivaTasaDefault;
      const ivaIncluido = cfg.preciosIncluyenIva;
      const montoLinea = montoDeItem({ cantidad, precioUnitario, descuento: pct });
      // subtotal de la línea = SIN IVA (con precios que incluyen IVA se desglosa; sin IVA incluido es el neto de siempre).
      const subtotalLinea = ivaIncluido ? this.round2(montoLinea / (1 + tasaNumerica(tasaIva))) : montoLinea;
      const { notaCocinaId: _n, anulado: _a, tasaIva: _t, ivaIncluido: _i, ...limpio } = it;
      salida.push({ ...limpio, productoId: it.productoId, nombre: p.name, cantidad, precioUnitario, descuento: pct, subtotal: subtotalLinea, tasaIva, ivaIncluido });
    }
    const t = totalesDeItems(salida);
    return { items: salida, subtotal: t.subtotal, descuento: t.descuento, impuestos: t.impuestos, total: t.total };
  }

  // Formas de pago de una venta que nace PAGADA: solo los campos conocidos; quién cobró y desde dónde se estampa del token
  // (lo que mande el cliente en cobradoPor*, origen, dividido* o itemIndexes se descarta). Deben cubrir el total del servidor.
  // CORTESIA es una venta sin cobro: solo GERENTE y ADMIN. Quien la autoriza sale del token (autorizadoPor del cliente
  // se descarta), así queda en el corte y en la venta quién regaló qué.
  private assertCortesiaPermitida(actor?: Actor): void {
    if (!ROLES_CORTESIA.includes(actor?.roleCode ?? '')) {
      throw new ForbiddenException('Solo un gerente o administrador puede registrar una cortesía. Pide a un gerente que la autorice.');
    }
  }

  private autorizadoPorDe(actor?: Actor): string | undefined {
    return actor?.email ?? actor?.id;
  }

  private sanearPagos(pagos: any[], total: number, actor?: Actor): NonNullable<Sale['formasPago']> {
    const FORMAS = ['EFECTIVO', 'TARJETA', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'CORTESIA'];
    const limpios = pagos.map((p, i) => {
      const monto = this.round2(Number(p?.monto));
      if (!p || !FORMAS.includes(p.forma) || !Number.isFinite(monto) || monto < 0) {
        throw new BadRequestException(`Forma de pago ${i + 1} inválida.`);
      }
      return {
        forma: p.forma as any,
        monto,
        ...(p.montoRecibido !== undefined ? { montoRecibido: Number(p.montoRecibido) } : {}),
        ...(p.cambio !== undefined ? { cambio: Number(p.cambio) } : {}),
        ...(p.ultimos4Digitos ? { ultimos4Digitos: p.ultimos4Digitos } : {}),
        ...(p.folioVoucher ? { folioVoucher: p.folioVoucher } : {}),
        ...(p.claveRastreo ? { claveRastreo: p.claveRastreo } : {}),
        ...(p.bancoOrigen ? { bancoOrigen: p.bancoOrigen } : {}),
        ...(p.motivo ? { motivo: p.motivo } : {}),
        ...(p.forma === 'CORTESIA' ? { autorizadoPor: this.autorizadoPorDe(actor) } : {}),
        ...(actor ? { cobradoPorId: actor.id, cobradoPorEmail: actor.email, cobradoPorRol: actor.roleCode, origen: contextoCobro(actor) } : {}),
      };
    });
    if (limpios.some((p) => p.forma === 'CORTESIA')) this.assertCortesiaPermitida(actor);
    const pagado = this.round2(limpios.reduce((s, p) => s + p.monto, 0));
    if (pagado < this.round2(total - 0.01)) {
      throw new BadRequestException(`Las formas de pago (${pagado}) no cubren el total de la venta (${total}). Actualiza el catálogo e intenta de nuevo.`);
    }
    // Un pago de más (efectivo con cambio) no infla el corte: el excedente sale de la línea en efectivo y queda como cambio
    // (montoRecibido = lo que entregó el cliente). El corte suma formasPago[].monto, así que debe sumar exactamente el total.
    let exceso = this.round2(pagado - total);
    if (exceso > 0.01) {
      for (let i = limpios.length - 1; i >= 0 && exceso > 0.001; i--) {
        if (limpios[i].forma !== 'EFECTIVO') continue;
        const quitar = Math.min(exceso, limpios[i].monto);
        limpios[i] = {
          ...limpios[i],
          montoRecibido: limpios[i].montoRecibido ?? limpios[i].monto,
          monto: this.round2(limpios[i].monto - quitar),
          cambio: this.round2((limpios[i].cambio ?? 0) + quitar),
        };
        exceso = this.round2(exceso - quitar);
      }
      if (exceso > 0.01) {
        throw new BadRequestException(`Los pagos que no son en efectivo (${this.round2(pagado - total)} de más) exceden el total de la venta (${total}).`);
      }
    }
    return limpios;
  }

  private async calculateCostoReal(items: SaleItem[], tenantId: string, ventaServicioHabilitada: boolean): Promise<number> {
    let total = 0;
    for (const item of items) {
      const product = await this.productRepo.findOne({ where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;
      // POS flexible, capacidad venta_de_servicio: un servicio nunca contribuye a
      // costoReal, sin importar si por error quedó con recipeId/insumoId vinculado — el
      // chequeo va ANTES de las ramas de type, no depende de que además le falten esos
      // campos.
      if (product.esServicio && ventaServicioHabilitada) continue;
      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await this.recipeRepo.findOne({ where: { id: product.recipeId } });
        if (recipe?.items) {
          for (const ri of recipe.items) {
            const crudo = await this.insumoRepo.findOne({ where: { id: ri.insumoId } });
            // Punto 2 (GoodsHabits): mismo motivo que deductInsumo() — si el insumo de la
            // receta ya fue reemplazado, el costoReal de la venta debe reflejar el costo
            // del insumo vigente, no el descontinuado (quedaría inconsistente con lo que
            // deductInsumo() realmente descuenta más abajo si no se resuelve acá también).
            const insumo = crudo ? await this.resolveActiveInsumo(crudo) : null;
            if (insumo) total += Number(insumo.costoUnitario) * ri.cantidad * item.cantidad;
          }
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        const crudo = await this.insumoRepo.findOne({ where: { id: product.insumoId } });
        const insumo = crudo ? await this.resolveActiveInsumo(crudo) : null;
        if (insumo) total += Number(insumo.costoUnitario) * item.cantidad;
      }
    }
    return Math.round(total * 100) / 100;
  }

  async create(data: {
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    impuestos: number;
    total: number;
    formaPago?: string;
    formasPago?: any[];
    cajero: string;
    turnoId: string;
    sucursalId: string;
    tenantId: string;
    notas?: string;
    referencia?: string;
    tableId?: string;
    clientTimestamp?: string;
    citaId?: string; // POS flexible, capacidad ligar_venta_a_cita (se ignora si la capacidad está inactiva)
    socioId?: string; // Gimnasio, capacidad membresias: socio al que se cobra la membresía o se le aplica su beneficio
    folio?: string; // generado en el cliente (Fase A1, modo offline). Si no viene,
                     // se genera server-side como siempre — retrocompatible.
  }, actor?: Actor) {
    // notaCocinaId/anulado son marcas del servidor (cancelación de cuentas abiertas): lo que
    // venga del cliente se descarta para que nadie pueda simular "ya salió a cocina".
    data = { ...data, items: (data.items || []).map(({ notaCocinaId: _n, anulado: _a, ...resto }: any) => resto) };
    const folio = data.folio || await this.generateFolio();
    // Fuera del try (más abajo): un clientTimestamp inválido debe llegar al cliente como
    // 400 (BadRequestException), no enmascararse como 500 por el catch genérico de la venta.
    const now = resolveEventTimestamp(data.clientTimestamp);

    // Un folio que ya está registrado (reintento tras perder la respuesta) se detecta ANTES de recalcular nada: si el precio
    // cambió entre el primer envío y el reintento, el pago ya no cubriría y el error sería "no cubren" en vez de "ya existe".
    if (data.folio) {
      // Si la consulta falla no se bloquea la venta: la restricción única de la BD (23505, más abajo) sigue siendo la red.
      const duplicada = await Promise.resolve().then(() => this.salesRepo.findOne({ where: { folio, tenantId: data.tenantId } })).catch(() => null);
      if (duplicada) throw await this.errorFolioDuplicado(folio, { tenantId: data.tenantId, sucursalId: data.sucursalId, cajero: data.cajero }, now);
    }

    // POS flexible, capacidad mesas_cuenta_abierta: con la capacidad activa y un tableId, la venta que nace ABIERTA (sin
    // formasPago) es una cuenta abierta ligada a esa mesa. Se valida ANTES de la transacción (mesa inexistente/ajena → 404
    // claro, no un 500 genérico).
    const nacePagada = !!(data.formasPago && data.formasPago.length > 0);
    const abreCuentaEnMesa = !nacePagada && (await this.resolveMesaParaCuentaAbierta(data.tableId, data.tenantId));

    // Precio de catálogo, descuento, IVA y total: los calcula el servidor (ver calcularImportes). Aislamiento por tenant: un
    // producto inexistente o de otro tenant es 400, ANTES de calcular o tocar nada. Esto vale también para una venta que
    // la cola offline reenvía al sincronizar: se recalcula, y si el pago cobrado ya no cubre el total real se rechaza.
    // Gimnasio, capacidad membresias: el plan es un producto del POS. Aquí se resuelve a qué socio se le cobra, se rechaza una
    // membresía suelta (sin socio) y se mete el descuento de beneficio como descuento por ítem, para que pase por los mismos
    // topes por rol de siempre. Sin la capacidad (o sin el módulo) esto no hace nada y socioId se ignora.
    let membresia: { socioId: string; plan: any; nota: string } | null = null;
    if (this.membresiasCore && (await this.tenantSettingsService.hasPosCapability(data.tenantId, 'membresias'))) {
      const prep = await this.membresiasCore.prepararVenta({
        socioId: data.socioId,
        items: data.items,
        tenantId: data.tenantId,
        permitirBeneficio: !abreCuentaEnMesa,
        nacePagada,
      });
      data = { ...data, items: prep.items };
      if (prep.nota) data = { ...data, notas: [data.notas, prep.nota].filter(Boolean).join(' ') };
      if (prep.plan && prep.socio) membresia = { socioId: prep.socio.id, plan: prep.plan, nota: prep.nota };
    }
    const calculado = await this.calcularImportes(data.items, data.tenantId, { actor, permitirDescuento: !abreCuentaEnMesa });
    if (Math.abs(this.round2(Number(data.total)) - calculado.total) > Math.max(0.02, 0.01 * calculado.items.length)) {
      console.warn(`SalesService.create: el total del cliente (${data.total}) no coincide con el del servidor (${calculado.total}), folio ${folio}; se usa el del servidor.`);
    }
    // El mesero y el capitán no cobran una venta directa fuera de la política de cobro (el POS normal no es suyo).
    if (nacePagada && actor && ['MESERO', 'CAPITAN'].includes(actor.roleCode ?? '')) {
      const politicaCobro = await this.tenantSettingsService.getPoliticaCobro(data.tenantId);
      if (!puedeCobrar(actor, politicaCobro)) {
        throw new ForbiddenException('Con la política de cobro de este negocio las cuentas solo se cobran en caja. Pasa la cuenta a caja.');
      }
    }
    const formasPagoFinal = nacePagada ? this.sanearPagos(data.formasPago as any[], calculado.total, actor) : [];
    data = {
      ...data,
      items: calculado.items,
      subtotal: calculado.subtotal,
      descuento: calculado.descuento,
      impuestos: calculado.impuestos,
      total: calculado.total,
      formasPago: formasPagoFinal,
    };

    // POS flexible, capacidad ligar_venta_a_cita: validado ANTES de abrir la transacción
    // (cita ajena/cancelada → rechazo sin tocar la BD).
    const citaId = await this.resolveCitaId(data.citaId, data.tenantId);

    // POS flexible, capacidad venta_de_servicio: se resuelve una sola vez, antes de
    // calculateCostoReal()/checkStockAvailability()/deductInventory() — las tres ramas que
    // deciden si un ítem descuenta inventario necesitan la misma respuesta, no vale la pena
    // preguntar la capacidad por ítem.
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(
      data.tenantId,
      'venta_de_servicio',
    );

    const costoReal = await this.calculateCostoReal(data.items, data.tenantId, ventaServicioHabilitada);

    // Auditoría de producto (GoodsHabits, Punto 1): chequeo de disponibilidad ANTES de
    // abrir la transacción — si el tenant tiene stockPolicy BLOQUEAR y algo no alcanza,
    // la venta se rechaza con detalle claro de qué falta, sin tocar la BD. Bajo
    // PERMITIR_NEGATIVO (default) es un no-op inmediato.
    await this.checkStockAvailability(data.items, data.tenantId, ventaServicioHabilitada);

    // POS flexible, capacidad notas_cocina_barra: se resuelve ANTES de abrir la
    // transacción (mismo criterio que checkStockAvailability arriba) — un solo query de
    // capacidad por venta, no uno por ítem dentro de la transacción.
    const notasCocinaHabilitada = await this.tenantSettingsService.hasPosCapability(
      data.tenantId,
      'notas_cocina_barra',
    );

    // Con usuario autenticado (el controller siempre lo pasa), una cuenta de mesa se estampa en el SERVIDOR: el
    // mesero de la cuenta sale del token (no del texto `cajero` que manda el cliente) y el turno es el abierto
    // de la sucursal (una tableta POS Lite no tiene turno: antes la cuenta quedaba sin turnoId y su efectivo no
    // entraba a ningún corte).
    const estampa = !!(abreCuentaEnMesa && actor);
    const cajeroFinal = estampa ? (actor!.email ?? actor!.id ?? data.cajero) : data.cajero;

    let savedSale: Sale;
    let lowStockInsumos: LowStockInsumo[] = [];

    try {
      // Venta + descuento de inventario en una sola transacción: si cualquier parte
      // falla, TypeORM hace rollback de todo (ni la venta ni el inventario quedan a
      // medias) y relanza el error, que se captura abajo.
      savedSale = await this.dataSource.transaction(async (manager) => {
        // Una sola cuenta abierta por mesa. El lock de la fila de la mesa serializa dos
        // aperturas simultáneas sobre la misma mesa: la segunda espera, ve la cuenta de la
        // primera y recibe el 409 (ConflictException, el único error que create() deja pasar).
        if (abreCuentaEnMesa) {
          const mesa = await manager.findOne(Table, {
            where: { id: data.tableId as string, tenantId: data.tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          const otraCuenta = await manager.findOne(Sale, {
            where: { tenantId: data.tenantId, tableId: data.tableId as string, status: 'ABIERTA' },
          });
          if (otraCuenta) {
            throw new ConflictException(
              `La mesa ${mesa?.number ?? ''} ya tiene una cuenta abierta (folio ${otraCuenta.folio}).`,
            );
          }
        }

        let turnoIdFinal = data.turnoId;
        if (estampa) {
          const turno = await this.resolverTurnoDeCuenta(manager, data.turnoId, data.sucursalId, data.tenantId);
          turnoIdFinal = turno.id;
        }

        const sale = manager.create(Sale, {
          folio,
          fecha: now,
          hora: now.toTimeString().slice(0, 8),
          items: data.items,
          subtotal: data.subtotal,
          descuento: data.descuento,
          impuestos: data.impuestos,
          total: data.total,
          formaPago: (formasPagoFinal[0]?.forma ?? data.formaPago) as any,
          formasPago: formasPagoFinal,
          // Mark as PAGADA immediately when payment forms are included
          status: nacePagada ? 'PAGADA' : 'ABIERTA',
          cajero: cajeroFinal,
          turnoId: turnoIdFinal,
          sucursalId: data.sucursalId,
          tenantId: data.tenantId,
          notas: data.notas || '',
          referencia: data.referencia || '',
          tableId: data.tableId || null,
          citaId,
          costoReal,
        });

        const saved = await manager.save(sale);

        // Mesa ocupada en la MISMA transacción: si la venta se revierte, la mesa no cambia.
        if (abreCuentaEnMesa) {
          await manager.update(Table, data.tableId as string, { status: 'OCCUPIED', updatedAt: new Date() });
        }

        // Gimnasio: la membresía cobrada nace (o se renueva) en la MISMA transacción de la venta: si la venta se revierte,
        // la membresía no queda. El importe guardado es el total que calculó el servidor.
        if (membresia && saved.status === 'PAGADA') {
          await this.membresiasCore!.activarPorVenta(manager, {
            tenantId: data.tenantId,
            socioId: membresia.socioId,
            plan: membresia.plan,
            venta: { id: saved.id, folio, total: data.total },
            creadoPor: actor?.email ?? actor?.id,
          });
        }

        // POS flexible, capacidad ligar_venta_a_cita: una venta que nace PAGADA completa la
        // cita en la MISMA transacción (si se revierte, la cita no cambia). Una venta ABIERTA
        // la completará pay() al cobrarse.
        if (citaId && saved.status === 'PAGADA') {
          await this.appointmentsService.completarPorVenta(citaId, data.tenantId, manager);
        }

        // Deduct inventory for each product sold; junta los insumos que quedaron en
        // stock bajo para generar sus alertas DESPUÉS de confirmar la venta (abajo).
        lowStockInsumos = await this.deductInventory(manager, data.items, folio, data.tenantId, data.sucursalId, ventaServicioHabilitada);

        // POS flexible, capacidad notas_cocina_barra: paso adicional dentro de la MISMA
        // transacción de la venta (no un servicio paralelo) — si la venta se revierte, las
        // notas generadas se revierten con ella.
        if (notasCocinaHabilitada) {
          const notaIds = await this.generateNotasCocina(manager, data.items, saved.id, data.tenantId, data.sucursalId);
          if (notaIds.some(Boolean)) {
            // Marca cada ítem que salió a cocina/barra (ver SaleItem.notaCocinaId): al cancelar la
            // cuenta o quitar el ítem, esos NO devuelven stock y se registran como merma.
            const marcados = data.items.map((it, i) => (notaIds[i] ? { ...it, notaCocinaId: notaIds[i] as string } : it));
            await manager.update(Sale, saved.id, { items: marcados });
            saved.items = marcados;
          }
        }

        return saved;
      });
    } catch (error) {
      // 409 de cuenta abierta (mesa ya ocupada por otra cuenta) y 400 de turno inválido o sin turno abierto:
      // llegan tal cual al cliente.
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      // Colisión de folio (23505 = unique_violation de Postgres): error específico y
      // claro, NO el mensaje genérico de "intenta de nuevo" — un folio duplicado
      // (generado en el cliente, Fase A1) fallaría exactamente igual en cada reintento
      // con el mismo folio; el cajero necesita una señal distinta a un fallo transitorio.
      // BadRequestException (HttpException real) para que llegue como 400 al cliente,
      // no enmascarado como 500 — mismo cuidado que con clientTimestamp más arriba.
      if ((error as any)?.code === '23505') {
        console.error(`SalesService.create: folio duplicado (folio ${folio}):`, error);
        throw await this.errorFolioDuplicado(folio, { tenantId: data.tenantId, sucursalId: data.sucursalId, cajero: cajeroFinal }, now);
      }
      // Detalle técnico completo al log (para soporte/diagnóstico), mensaje genérico
      // y accionable al cajero: la causa más probable es momentánea (red, timeout) y
      // un reintento inmediato del mismo cobro debería funcionar.
      console.error(`SalesService.create error (folio ${folio}, rollback aplicado, nada quedó guardado):`, error);
      throw new Error('No se pudo procesar la venta, intenta de nuevo.');
    }

    // Alertas de stock bajo: best-effort, fuera de la transacción de la venta. La venta
    // ya está confirmada y cobrada; un fallo aquí no debe afectarla en absoluto.
    if (lowStockInsumos.length > 0) {
      await this.reportLowStockAlerts(lowStockInsumos, data, folio);
    }

    return savedSale;
  }

  private async reportLowStockAlerts(
    insumos: LowStockInsumo[],
    data: { sucursalId: string; tenantId: string; cajero: string },
    folio: string,
  ) {
    let companyId: string | undefined;
    try {
      // Insumo/Product/Sale no tienen companyId propio — se resuelve vía la sucursal,
      // que sí lo tiene (Branch.companyId), sin necesitar ningún cambio de esquema.
      const branch = await this.dataSource.getRepository(Branch).findOne({ where: { id: data.sucursalId } });
      companyId = branch?.companyId;
    } catch (error) {
      console.error(`SalesService: error al resolver companyId desde sucursalId ${data.sucursalId} para alertas de stock (folio ${folio}):`, error);
    }

    if (!companyId) {
      console.error(`SalesService: companyId no encontrado para sucursalId ${data.sucursalId}, se omiten alertas de stock bajo (folio ${folio})`);
      return;
    }

    for (const insumo of insumos) {
      try {
        const estado = insumo.stockActual <= 0 ? 'agotado' : 'proximo';
        await this.insumoAlertsService.upsert(data.tenantId, companyId, data.cajero, {
          insumoId: insumo.id,
          nombre: insumo.nombre,
          tipo: 'insumo',
          estado,
          notas: `Auto-generada por venta ${folio}: stock actual ${insumo.stockActual} (mínimo ${insumo.stockMinimo}).`,
        });
      } catch (error) {
        console.error(`SalesService: no se pudo crear/actualizar alerta de stock bajo para insumo ${insumo.nombre} (${insumo.id}), venta ${folio}:`, error);
      }
    }
  }

  // Auditoría de producto (GoodsHabits, Punto 1): agrega la cantidad total requerida POR
  // insumo YA RESUELTO (ver resolveActiveInsumo) a través de todo el carrito — dos
  // productos del mismo ticket pueden compartir insumo, y si uno apunta a un insumo ya
  // reemplazado, el chequeo debe hacerse contra el insumo vigente, no el descontinuado
  // (mismo criterio que aplicará deductInsumo() al momento real de descontar).
  private async checkStockAvailability(items: SaleItem[], tenantId: string, ventaServicioHabilitada: boolean): Promise<void> {
    const setting = await this.tenantSettingRepo.findOne({ where: { tenantId } });
    if ((setting?.stockPolicy || 'PERMITIR_NEGATIVO') !== 'BLOQUEAR') return;

    const neededByInsumo = new Map<string, { nombre: string; cantidad: number }>();

    const acumular = async (rawInsumoId: string, cantidad: number) => {
      const crudo = await this.insumoRepo.findOne({ where: { id: rawInsumoId } });
      if (!crudo) return;
      const resuelto = await this.resolveActiveInsumo(crudo);
      const actual = neededByInsumo.get(resuelto.id);
      neededByInsumo.set(resuelto.id, {
        nombre: resuelto.nombre,
        cantidad: (actual?.cantidad || 0) + cantidad,
      });
    };

    for (const item of items) {
      const product = await this.productRepo.findOne({ where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;

      // POS flexible, capacidad venta_de_servicio: un servicio nunca exige stock
      // disponible, sin importar si por error quedó con recipeId/insumoId vinculado.
      if (product.esServicio && ventaServicioHabilitada) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await this.recipeRepo.findOne({ where: { id: product.recipeId } });
        if (!recipe?.items) continue;
        for (const ri of recipe.items) {
          await acumular(ri.insumoId, ri.cantidad * item.cantidad);
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        await acumular(product.insumoId, item.cantidad);
      }
    }

    const faltantes: { insumo: string; disponible: number; requerido: number }[] = [];
    for (const [insumoId, { nombre, cantidad }] of neededByInsumo) {
      const insumo = await this.insumoRepo.findOne({ where: { id: insumoId } });
      if (!insumo) continue;
      const disponible = Number(insumo.stockActual);
      if (disponible < cantidad) {
        faltantes.push({ insumo: nombre, disponible, requerido: cantidad });
      }
    }

    if (faltantes.length > 0) {
      throw new BadRequestException({
        message: 'Stock insuficiente para completar la venta',
        faltantes,
      });
    }
  }

  // Ronda de seguimiento (arquitectura): la caminata de reemplazadoPorId se unificó en
  // insumo-resolution.ts (compartida con costs.service.ts/products.service.ts) — este método
  // solo traduce el resultado al contrato de error que ya tenía (Error en ciclo,
  // BadRequestException en los otros dos casos, mismos mensajes exactos — venta real, el
  // cajero necesita un 400 claro). `manager` sigue siendo opcional: se pasa el manager
  // transaccional activo cuando se llama desde dentro de la transacción (deductInsumo), se
  // omite en el chequeo previo (checkStockAvailability, que corre ANTES de abrir la
  // transacción) — ahí se usa this.insumoRepo.manager (no-transaccional, equivalente exacto a
  // this.insumoRepo.findOne() de antes).
  private async resolveActiveInsumo(
    insumo: Insumo,
    manager?: EntityManager,
    visitados: Set<string> = new Set(),
  ): Promise<Insumo> {
    const resultado = await resolveActiveInsumoChain(manager ?? this.insumoRepo.manager, insumo, visitados);
    if (resultado.ok) {
      return resultado.insumo;
    }
    if (resultado.reason === 'CYCLE') {
      throw new Error(`Referencia circular en la cadena de reemplazo del insumo ${resultado.insumoId}`);
    }
    if (resultado.reason === 'NO_REPLACEMENT') {
      throw new BadRequestException(`El insumo "${resultado.nombre}" está inactivo y no tiene reemplazo configurado — no se puede vender.`);
    }
    throw new BadRequestException(`El insumo de reemplazo de "${resultado.nombre}" no existe.`);
  }

  private async deductInventory(manager: EntityManager, items: SaleItem[], folio: string, tenantId: string, sucursalId: string, ventaServicioHabilitada: boolean): Promise<LowStockInsumo[]> {
    const lowStock: LowStockInsumo[] = [];
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;

      // POS flexible, capacidad venta_de_servicio: un servicio nunca descuenta inventario,
      // sin importar si por error quedó con recipeId/insumoId vinculado — el chequeo va
      // ANTES de las ramas de type, no depende de que además le falten esos campos. Con la
      // capacidad INACTIVA (ventaServicioHabilitada=false), este `continue` nunca se toma
      // — un producto marcado esServicio=true cae directo a las ramas de abajo y se
      // comporta como un producto normal (si además tiene insumoId, SÍ descuenta).
      if (product.esServicio && ventaServicioHabilitada) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        // Deduct recipe ingredients
        lowStock.push(...await this.deductRecipeIngredients(manager, product.recipeId, item.cantidad, folio, tenantId, sucursalId));
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        // Deduct single insumo
        const result = await this.deductInsumo(manager, product.insumoId, item.cantidad, folio, tenantId, sucursalId);
        if (result) lowStock.push(result);
      }
    }
    return lowStock;
  }

  private async deductRecipeIngredients(manager: EntityManager, recipeId: string, quantity: number, folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo[]> {
    const recipe = await manager.findOne(Recipe, { where: { id: recipeId } });
    const lowStock: LowStockInsumo[] = [];
    if (!recipe || !recipe.items) return lowStock;

    for (const item of recipe.items) {
      const result = await this.deductInsumo(manager, item.insumoId, item.cantidad * quantity, folio, tenantId, sucursalId);
      if (result) lowStock.push(result);
    }
    return lowStock;
  }

  private async deductInsumo(manager: EntityManager, insumoId: string, quantity: number, folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo | null> {
    const insumoCrudo = await manager.findOne(Insumo, { where: { id: insumoId } });
    if (!insumoCrudo) return null;
    // Punto 2: resuelve la cadena de reemplazo — si insumoId apunta a un insumo ya
    // reemplazado, descuenta del insumo vigente, no del descontinuado.
    const insumo = await this.resolveActiveInsumo(insumoCrudo, manager);

    // Punto 1: antes clampaba a 0 con Math.max(0, ...) — le mentía al ledger auditable
    // (InventoryMovement.stockResultante) sobre el déficit real. checkStockAvailability()
    // ya rechazó la venta más arriba si el tenant tiene stockPolicy BLOQUEAR y esto no
    // alcanzaba; si llegamos hasta acá, o el tenant permite negativo, o alcanzaba de
    // sobra — en ambos casos la resta debe ser honesta, no clampada.
    const newStock = Number(insumo.stockActual) - quantity;
    await manager.update(Insumo, insumo.id, { stockActual: newStock });

    // Ledger auditable del movimiento — misma transacción que el descuento de stock,
    // a diferencia de las alertas de stock bajo (esas sí son best-effort y van aparte).
    const movement = manager.create(InventoryMovement, {
      insumoId: insumo.id,
      tenantId,
      tipo: 'SALIDA_VENTA',
      cantidad: quantity,
      stockResultante: newStock,
      costoUnitario: Number(insumo.costoUnitario),
      referencia: folio,
      sucursalId,
    });
    await manager.save(movement);

    const stockMinimo = Number(insumo.stockMinimo);
    if (newStock <= stockMinimo) {
      return { id: insumo.id, nombre: insumo.nombre, stockActual: newStock, stockMinimo };
    }
    return null;
  }

  // POS flexible, capacidad notas_cocina_barra: una NotaCocina por ÍTEM cuyo producto tenga
  // estacionPreparacion asignada (no todos los ítems de la venta, solo los que van a
  // cocina/barra — ver Product.estacionPreparacion). estacion se copia del producto en este
  // momento, no queda como referencia viva: si el producto cambia de estación después, esta
  // nota ya generada conserva la estación con la que se creó.
  private async generateNotasCocina(
    manager: EntityManager,
    items: SaleItem[],
    saleId: string,
    tenantId: string,
    sucursalId: string,
  ): Promise<Array<string | null>> {
    const ids: Array<string | null> = [];
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product || !product.estacionPreparacion) {
        ids.push(null);
        continue;
      }

      const nota = manager.create(NotaCocina, {
        tenantId,
        sucursalId,
        saleId,
        productoId: product.id,
        nombre: product.name,
        cantidad: item.cantidad,
        estacion: product.estacionPreparacion,
        estado: 'PENDIENTE',
      });
      const guardada = await manager.save(nota);
      ids.push(guardada?.id ?? null);
    }
    return ids;
  }

  async findAll(filters?: {
    status?: string;
    cajero?: string;
    turnoId?: string;
    sucursalId?: string;
    tenantId?: string;
    fechaInicio?: Date;
    fechaFin?: Date;
  }) {
    try {
      const query = this.salesRepo.createQueryBuilder('sale');

      if (filters?.status) {
        query.andWhere('sale.status = :status', { status: filters.status });
      }
      if (filters?.cajero) {
        query.andWhere('sale.cajero = :cajero', { cajero: filters.cajero });
      }
      if (filters?.turnoId) {
        query.andWhere('sale.turnoId = :turnoId', { turnoId: filters.turnoId });
      }
      if (filters?.sucursalId) {
        query.andWhere('sale.sucursalId = :sucursalId', { sucursalId: filters.sucursalId });
      }
      if (filters?.tenantId) {
        query.andWhere('sale.tenantId = :tenantId', { tenantId: filters.tenantId });
      }
      if (filters?.fechaInicio) {
        query.andWhere('sale.fecha >= :fechaInicio', { fechaInicio: filters.fechaInicio });
      }
      if (filters?.fechaFin) {
        query.andWhere('sale.fecha <= :fechaFin', { fechaFin: filters.fechaFin });
      }

      return query.orderBy('sale.createdAt', 'DESC').getMany();
    } catch (error) {
      console.error('SalesService.findAll error:', error);
      throw new Error(`Error al obtener ventas: ${error.message}`);
    }
  }

  // Auditoría BUSINESS (hallazgo transversal #6): findOne()/pay()/cancel()/applyDiscount()/
  // returnSale() no verificaban que la venta perteneciera al tenant de quien llama — Sale sí
  // tiene tenantId propio, así que basta con sumarlo al where. Se reutiliza el mismo mensaje
  // "Venta no encontrada" que ya usa el catch de cada método (no un 403 nuevo) para no
  // revelar si el id existe en otro tenant y para no romper el formato de error existente.
  async findOne(id: string, tenantId?: string) {
    try {
      return this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
    } catch (error) {
      console.error('SalesService.findOne error:', error);
      throw new Error(`Error al obtener venta: ${error.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // POS flexible, capacidad mesas_cuenta_abierta. NO es un camino paralelo: una cuenta abierta ES
  // una Sale con status ABIERTA y tableId (ya existían). Agregar ítems reutiliza las mismas
  // ramas de inventario/costo/notas que create() (deductInventory, checkStockAvailability,
  // calculateCostoReal, generateNotasCocina — y con ellas venta_de_servicio y
  // notas_cocina_barra), y cobrar reutiliza formasPago + el cierre PAGADA de siempre (y con él
  // la transición de la cita de ligar_venta_a_cita). Todo en transacciones con lock sobre la
  // fila de la venta, porque aquí dos cajeros pueden tocar la misma cuenta a la vez (agregar un
  // ítem mientras otro cobra una parte): sin lock el saldo se calcularía sobre datos viejos.
  // ───────────────────────────────────────────────────────────────────────────────────────────

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private sumPagos(formasPago?: Sale['formasPago'] | null): number {
    const pagos = Array.isArray(formasPago) ? formasPago : [];
    return this.round2(pagos.reduce((sum, fp) => sum + (Number(fp?.monto) || 0), 0));
  }

  // Con la capacidad activa y un tableId: la mesa debe existir en el tenant y estar activa.
  // Devuelve false (comportamiento de siempre: tableId se guarda sin más) si no aplica.
  private async resolveMesaParaCuentaAbierta(tableId?: string, tenantId?: string): Promise<boolean> {
    if (!tableId || !tenantId) return false;
    if (!(await this.tenantSettingsService.hasPosCapability(tenantId, 'mesas_cuenta_abierta'))) return false;
    const mesa = await this.dataSource.getRepository(Table).findOne({ where: { id: tableId, tenantId } });
    if (!mesa || !mesa.isActive) {
      throw new NotFoundException('Mesa no encontrada');
    }
    return true;
  }

  private async assertCuentasAbiertasHabilitada(tenantId?: string): Promise<string> {
    if (!tenantId) {
      throw new ForbiddenException('Se requiere un tenant para operar cuentas abiertas.');
    }
    if (!(await this.tenantSettingsService.hasPosCapability(tenantId, 'mesas_cuenta_abierta'))) {
      throw new ForbiddenException('La capacidad mesas_cuenta_abierta no está activa para este negocio.');
    }
    return tenantId;
  }

  // Cierra/cancela la cuenta → la mesa vuelve a AVAILABLE (solo si seguía OCCUPIED, no pisa un
  // estado puesto a mano como RESERVED/DIRTY). Misma transacción que el cierre.
  private async liberarMesa(manager: EntityManager, sale: { tableId: string | null; tenantId: string }) {
    if (!sale.tableId || !sale.tenantId) return;
    await manager.update(Table, { id: sale.tableId, tenantId: sale.tenantId, status: 'OCCUPIED' }, {
      status: 'AVAILABLE',
      updatedAt: new Date(),
    });
  }

  // ── Devolución de stock y merma de una cuenta abierta ───────────────────────────────────────
  // Espejo de deductInventory()/deductRecipeIngredients()/deductInsumo(): mismas ramas (recetas,
  // insumo simple, venta_de_servicio), misma resolución de la cadena de reemplazo de insumos
  // (resolveActiveInsumo) y el mismo ledger auditable (InventoryMovement) — la devolución pasa por
  // la cadena real de Costos, no por una lógica de inventario propia del POS. Siempre con el
  // EntityManager de la transacción de quien llama (cancelar la cuenta / quitar el ítem).
  private async restoreInventory(
    manager: EntityManager,
    items: SaleItem[],
    folio: string,
    tenantId: string,
    sucursalId: string,
    ventaServicioHabilitada: boolean,
    tipoMovimiento = 'ENTRADA_CANCELACION',
  ): Promise<void> {
    for (const item of items) {
      const product = await manager.findOne(Product, { where: this.productWhere(item.productoId, tenantId) });
      if (!product) continue;
      // Mismo criterio que deductInventory(): un servicio nunca descontó inventario, así que no
      // hay nada que devolver.
      if (product.esServicio && ventaServicioHabilitada) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await manager.findOne(Recipe, { where: { id: product.recipeId } });
        if (!recipe || !recipe.items) continue;
        for (const ri of recipe.items) {
          await this.restoreInsumo(manager, ri.insumoId, ri.cantidad * item.cantidad, folio, tenantId, sucursalId, tipoMovimiento);
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        await this.restoreInsumo(manager, product.insumoId, item.cantidad, folio, tenantId, sucursalId, tipoMovimiento);
      }
    }
  }

  private async restoreInsumo(
    manager: EntityManager,
    insumoId: string,
    quantity: number,
    folio: string,
    tenantId: string,
    sucursalId: string,
    tipoMovimiento = 'ENTRADA_CANCELACION',
  ): Promise<void> {
    const insumoCrudo = await manager.findOne(Insumo, { where: { id: insumoId } });
    if (!insumoCrudo) return;
    // Cadena de reemplazo: el stock vuelve al insumo vigente. Si la cadena está rota (insumo
    // inactivo sin reemplazo) NO se bloquea la cancelación: se devuelve al insumo original.
    let destino: Insumo = insumoCrudo;
    try {
      destino = await this.resolveActiveInsumo(insumoCrudo, manager);
    } catch {
      destino = insumoCrudo;
    }
    // Leer-sumar-escribir: se relee con lock de escritura para no pisar otra venta simultánea.
    const insumo = (await manager.findOne(Insumo, { where: { id: destino.id }, lock: { mode: 'pessimistic_write' } })) ?? destino;
    const newStock = Number(insumo.stockActual) + quantity;
    await manager.update(Insumo, insumo.id, { stockActual: newStock });

    const movement = manager.create(InventoryMovement, {
      insumoId: insumo.id,
      tenantId,
      tipo: tipoMovimiento,
      cantidad: quantity,
      stockResultante: newStock,
      costoUnitario: Number(insumo.costoUnitario),
      referencia: folio,
      sucursalId,
    });
    await manager.save(movement);
  }

  // Merma por la vía existente de Costos (Justifiable, categoría MERMAS_FALTANTES): el stock de
  // estos ítems ya se descontó al ordenar y NO se devuelve (ya se preparó o está en preparación),
  // así que la pérdida queda registrada en dinero para el período, con el detalle de qué se perdió.
  private async registrarMerma(
    manager: EntityManager,
    sale: { id: string; folio: string; tenantId: string; sucursalId: string },
    items: SaleItem[],
    monto: number,
    descripcion: string,
  ): Promise<void> {
    const hoy = new Date();
    const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    await this.costsService.createJustifiable(
      {
        periodo,
        categoria: JustifiableCategory.MERMAS_FALTANTES,
        descripcion,
        monto,
        detalles: {
          saleId: sale.id,
          folio: sale.folio,
          items: items.map((it) => ({ productoId: it.productoId, nombre: it.nombre, cantidad: it.cantidad })),
        },
        tenantId: sale.tenantId,
        branchId: sale.sucursalId,
      },
      manager,
    );
  }

  // Cancela una cuenta abierta de mesa. Ítems que NO salieron a cocina/barra → devuelven su
  // stock; ítems con NotaCocina emitida → sin devolución, merma. Todo (stock, merma, notas,
  // estado de la venta, mesa) en UNA transacción con lock sobre la venta: si algo falla a medio
  // camino se revierte completo.
  private async cancelarCuentaAbierta(id: string, motivo: string, tenantId: string, actor?: Actor): Promise<void> {
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(tenantId, 'venta_de_servicio');
    await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new Error('Venta no encontrada');
      if (sale.status !== 'ABIERTA') throw new Error('La cuenta ya no está abierta');
      if (this.sumPagos(sale.formasPago) > 0) {
        throw new BadRequestException('La cuenta tiene pagos parciales; no se puede cancelar');
      }

      const vivos = (sale.items || []).filter((it) => !it.anulado);
      // El mesero solo cancela cuentas sin ítems enviados a cocina/barra (y sin pagos, ya validado arriba). Se revisa
      // aquí, con la cuenta bajo lock: un ítem agregado y enviado justo antes no se le escapa.
      if (actor?.roleCode === 'MESERO' && vivos.some((it) => !!it.notaCocinaId)) {
        throw new ForbiddenException('El mesero solo puede cancelar cuentas sin ítems enviados a cocina o barra. Pide a un capitán o gerente.');
      }
      const aDevolver = vivos.filter((it) => !it.notaCocinaId);
      const aMerma = vivos.filter((it) => !!it.notaCocinaId);

      await this.restoreInventory(manager, aDevolver, sale.folio, tenantId, sale.sucursalId, ventaServicioHabilitada);
      if (aMerma.length > 0) {
        const monto = await this.calculateCostoReal(aMerma, tenantId, ventaServicioHabilitada);
        await this.registrarMerma(manager, sale, aMerma, monto, `Cancelación de la cuenta ${sale.folio}: ítems que ya salieron a cocina/barra`);
      }
      // Lo pendiente en cocina/barra deja de mostrarse; lo ya PREPARADO se conserva tal cual.
      await manager.update(NotaCocina, { saleId: id, estado: 'PENDIENTE' }, { estado: 'CANCELADA' });
      await manager.update(Sale, id, { status: 'CANCELADA', motivoCancelacion: motivo });
      await this.liberarMesa(manager, sale);
    });
  }

  private normalizarItems(items: any): SaleItem[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Se requiere al menos un ítem.');
    }
    return items.map((it, i) => {
      const cantidad = Number(it?.cantidad);
      if (!it || typeof it.productoId !== 'string' || !it.productoId || !(cantidad > 0)) {
        throw new BadRequestException(`Ítem ${i + 1} inválido: productoId y cantidad mayor a cero son requeridos.`);
      }
      const precioUnitario = Number(it.precioUnitario ?? 0);
      const descuento = Number(it.descuento ?? 0);
      const subtotal = it.subtotal !== undefined ? Number(it.subtotal) : precioUnitario * cantidad - descuento;
      if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(precioUnitario) || !Number.isFinite(descuento)) {
        throw new BadRequestException(`Ítem ${i + 1} inválido: importes no válidos.`);
      }
      const { notaCocinaId: _n, anulado: _a, ...limpio } = it; // marcas del servidor: no se aceptan del cliente
      return { ...limpio, productoId: it.productoId, nombre: it.nombre ?? '', cantidad, precioUnitario, descuento, subtotal: this.round2(subtotal) };
    });
  }

  // Cuentas abiertas del tenant (con saldo calculado), para que el POS retome una mesa.
  async buscarCuentasAbiertas(tenantId: string | undefined, filters: { tableId?: string; sucursalId?: string } = {}) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const where: any = { tenantId: t, status: 'ABIERTA', tableId: filters.tableId || Not(IsNull()) };
    if (filters.sucursalId) where.sucursalId = filters.sucursalId;
    const cuentas = await this.salesRepo.find({ where, order: { createdAt: 'ASC' } });
    return cuentas.map((c) => {
      const pagado = this.sumPagos(c.formasPago);
      return { ...c, pagado, saldoPendiente: this.round2(Number(c.total) - pagado) };
    });
  }

  // Suma consumos a una cuenta abierta (POST /pos/sales/:id/items). Cada ítem nuevo pasa por
  // las mismas reglas que una venta normal: pertenencia al tenant, stockPolicy BLOQUEAR,
  // descuento de inventario (venta_de_servicio lo salta), nota a cocina/barra (solo para los
  // ítems NUEVOS), costoReal. `items` queda append-only: los índices ya usados para dividir por
  // ítems siguen siendo válidos.
  async agregarItems(id: string, data: { items: any[]; impuestos?: number }, tenantId?: string) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const normalizados = this.normalizarItems(data?.items);

    const existente = await this.salesRepo.findOne({ where: { id, tenantId: t } });
    if (!existente) throw new NotFoundException('Venta no encontrada');
    if (existente.status !== 'ABIERTA') {
      throw new BadRequestException('Solo se pueden agregar ítems a una cuenta abierta.');
    }

    const nuevos = (await this.calcularImportes(normalizados, t, { permitirDescuento: false })).items;
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(t, 'venta_de_servicio');
    const notasCocinaHabilitada = await this.tenantSettingsService.hasPosCapability(t, 'notas_cocina_barra');
    await this.checkStockAvailability(nuevos, t, ventaServicioHabilitada);
    const costoNuevos = await this.calculateCostoReal(nuevos, t, ventaServicioHabilitada);

    let lowStockInsumos: LowStockInsumo[] = [];
    const actualizada = await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId: t }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException('Solo se pueden agregar ítems a una cuenta abierta.');
      }

      lowStockInsumos = await this.deductInventory(manager, nuevos, sale.folio, t, sale.sucursalId, ventaServicioHabilitada);
      let nuevosMarcados: SaleItem[] = nuevos;
      if (notasCocinaHabilitada) {
        const notaIds = await this.generateNotasCocina(manager, nuevos, sale.id, t, sale.sucursalId);
        nuevosMarcados = nuevos.map((it, i) => (notaIds[i] ? { ...it, notaCocinaId: notaIds[i] as string } : it));
      }

      // Se suma lo NUEVO con su propio IVA (la tasa de cada ítem, ya estampada por calcularImportes); lo que ya estaba en la
      // cuenta —incluido su descuento de cuenta— no se toca.
      const delta = totalesDeItems(nuevos);
      await manager.update(Sale, id, {
        items: [...(sale.items || []), ...nuevosMarcados],
        subtotal: this.round2(Number(sale.subtotal) + delta.subtotal),
        descuento: this.round2(Number(sale.descuento) + delta.descuento),
        impuestos: this.round2(Number(sale.impuestos) + delta.impuestos),
        total: this.round2(Number(sale.total) + delta.total),
        costoReal: this.round2(Number(sale.costoReal) + costoNuevos),
      });
      return manager.findOne(Sale, { where: { id } });
    });

    if (lowStockInsumos.length > 0) {
      await this.reportLowStockAlerts(lowStockInsumos, { sucursalId: existente.sucursalId, tenantId: t, cajero: existente.cajero }, existente.folio);
    }
    return actualizada;
  }

  // Quita un ítem de una cuenta abierta (DELETE /pos/sales/:id/items/:index). Según su estado:
  //  - NO salió a cocina/barra → se devuelve su stock por la cadena de Costos y baja el costoReal.
  //  - YA salió (tiene NotaCocina) → NO se devuelve stock; se registra la merma y su nota
  //    pendiente se cancela.
  // La línea se marca anulada en vez de borrarse: los índices usados para dividir la cuenta por
  // ítems no se desplazan si otro cajero cobra al mismo tiempo. El total baja en proporción
  // (conserva impuestos/descuento). Un ítem ya cobrado no se puede quitar, ni uno que deje el
  // total por debajo de lo ya cobrado.
  async quitarItem(id: string, index: number, tenantId?: string, actor?: Actor) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new BadRequestException('Índice de ítem inválido.');
    }
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(t, 'venta_de_servicio');

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId: t }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException('Solo se pueden quitar ítems de una cuenta abierta.');
      }

      const items = [...(sale.items || [])];
      const linea = items[idx];
      if (!linea || linea.anulado) {
        throw new BadRequestException(`Ítem ${idx} no existe en la cuenta.`);
      }
      // El mesero solo quita ítems que aún no salieron a cocina o barra (los demás roles conservan el comportamiento
      // de siempre: quitar un ítem enviado lo registra como merma).
      if (actor?.roleCode === 'MESERO' && linea.notaCocinaId) {
        throw new ForbiddenException('El mesero solo puede quitar ítems que aún no salieron a cocina o barra. Pide a un capitán o gerente.');
      }
      const pagos = Array.isArray(sale.formasPago) ? sale.formasPago : [];
      if (pagos.some((p) => (p.itemIndexes || []).includes(idx))) {
        throw new BadRequestException(`El ítem ${idx} ya fue cobrado: no se puede quitar.`);
      }

      // La cuenta baja en proporción a lo que pesa la línea CON su IVA (conserva el descuento de cuenta ya aplicado); el
      // impuesto baja según la parte de IVA de esa línea, así quitar un ítem exento no mueve el IVA de los demás.
      const vivos = items.filter((it) => !it.anulado);
      const pesoVivos = vivos.reduce((s, it) => s + pesoDeItem(it), 0);
      const impVivos = vivos.reduce((s, it) => s + pesoImpuestoDeItem(it), 0);
      const nuevoSubtotal = this.round2(Number(sale.subtotal) - Number(linea.subtotal));
      const pTotal = pesoVivos > 0 ? (pesoVivos - pesoDeItem(linea)) / pesoVivos : 0;
      const pImp = impVivos > 0 ? (impVivos - pesoImpuestoDeItem(linea)) / impVivos : 0;
      const nuevoTotal = this.round2(Number(sale.total) * pTotal);
      const nuevoImpuestos = this.round2(Number(sale.impuestos) * pImp);
      const pagado = this.sumPagos(pagos);
      if (nuevoTotal < pagado) {
        throw new BadRequestException(`No se puede quitar el ítem: el nuevo total (${nuevoTotal}) quedaría por debajo de lo ya cobrado (${pagado}).`);
      }

      const costoLinea = await this.calculateCostoReal([linea], t, ventaServicioHabilitada);
      let costoRealNuevo = Number(sale.costoReal);
      if (linea.notaCocinaId) {
        await this.registrarMerma(manager, sale, [linea], costoLinea, `Ítem quitado de la cuenta ${sale.folio} después de salir a cocina/barra`);
        await manager.update(NotaCocina, { id: linea.notaCocinaId, estado: 'PENDIENTE' }, { estado: 'CANCELADA' });
      } else {
        await this.restoreInventory(manager, [linea], sale.folio, t, sale.sucursalId, ventaServicioHabilitada);
        costoRealNuevo = Math.max(0, costoRealNuevo - costoLinea);
      }

      items[idx] = { ...linea, anulado: true };
      await manager.update(Sale, id, {
        items,
        subtotal: nuevoSubtotal,
        impuestos: nuevoImpuestos,
        total: nuevoTotal,
        costoReal: this.round2(costoRealNuevo),
      });
      return manager.findOne(Sale, { where: { id } });
    });
  }

  // Cobro (total o parcial) de una cuenta abierta (POST /pos/sales/:id/pagos). Mecanismo único
  // para todos los casos, sobre Sale.formasPago (que ya era un arreglo de {forma, monto}):
  //  - cobro total:           sin monto ni itemIndexes → paga el saldo completo.
  //  - dividir entre N:       los primeros N-1 mandan su monto (total/N); el ÚLTIMO omite monto y
  //                           paga exactamente el saldo, así los centavos de redondeo no se pierden.
  //  - dividir por ítems:     itemIndexes (posiciones en `items`) → monto = su parte proporcional
  //                           del total (incluye descuento/impuestos); el último grupo paga el
  //                           saldo. Un ítem no se puede cobrar dos veces.
  // La cuenta pasa a PAGADA solo cuando el saldo llega a 0 (entonces completa la cita ligada y
  // libera la mesa). Nunca se acepta un monto mayor al saldo.
  async cobrarCuenta(
    id: string,
    data: {
      formaPago: string;
      monto?: number;
      itemIndexes?: number[];
      montoRecibido?: number;
      cambio?: number;
      ultimos4Digitos?: string;
      folioVoucher?: string;
      claveRastreo?: string;
      bancoOrigen?: string;
      motivo?: string;
      autorizadoPor?: string;
    },
    tenantId?: string,
    actor?: Actor,
  ) {
    const t = await this.assertCuentasAbiertasHabilitada(tenantId);
    // Reglas de rol (el controller siempre pasa el usuario). Cobro completo: según politicaCobro y desde dónde
    // (caja o mesa). Cobro dividido: además politicaDivisionCuentas (se decide abajo, ya con el saldo bajo lock).
    let politicaCobro: PoliticaCobro | undefined;
    let politicaDivision: PoliticaDivision | undefined;
    if (actor) {
      [politicaCobro, politicaDivision] = await Promise.all([
        this.tenantSettingsService.getPoliticaCobro(t),
        this.tenantSettingsService.getPoliticaDivisionCuentas(t),
      ]);
      if (!puedeCobrar(actor, politicaCobro)) {
        throw new ForbiddenException(
          contextoCobro(actor) === 'MESA' && politicaCobro === 'SOLO_CAJA'
            ? 'Con la política de cobro de este negocio las cuentas solo se cobran en caja. Pasa la cuenta a caja.'
            : 'Tu rol no puede cobrar cuentas desde mesa con la política de cobro de este negocio. Pasa la cuenta a caja.',
        );
      }
    }
    const FORMAS = ['EFECTIVO', 'TARJETA', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'CORTESIA'];
    if (!data || !FORMAS.includes(data.formaPago)) {
      throw new BadRequestException('formaPago inválida.');
    }
    if (data.formaPago === 'CORTESIA') this.assertCortesiaPermitida(actor);
    if (data.monto !== undefined && data.itemIndexes !== undefined) {
      throw new BadRequestException('Manda monto o itemIndexes, no ambos.');
    }

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId: t }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException('La cuenta ya no está abierta.');
      }

      const pagos = Array.isArray(sale.formasPago) ? [...sale.formasPago] : [];
      const total = this.round2(Number(sale.total));
      const pagado = this.sumPagos(pagos);
      const saldo = this.round2(total - pagado);
      if (saldo <= 0) {
        throw new BadRequestException('La cuenta no tiene saldo pendiente.');
      }

      let monto: number;
      let indices: number[] | undefined;
      if (data.itemIndexes !== undefined) {
        const items = sale.items || [];
        const yaPagados = new Set<number>(pagos.flatMap((p) => p.itemIndexes || []));
        if (!Array.isArray(data.itemIndexes) || data.itemIndexes.length === 0) {
          throw new BadRequestException('itemIndexes debe ser un arreglo con al menos una posición.');
        }
        indices = [...new Set(data.itemIndexes)];
        for (const idx of indices) {
          if (!Number.isInteger(idx) || idx < 0 || idx >= items.length || items[idx].anulado) {
            throw new BadRequestException(`Ítem ${idx} no existe en la cuenta.`);
          }
          if (yaPagados.has(idx)) {
            throw new BadRequestException(`El ítem ${idx} ya fue cobrado.`);
          }
        }
        const vivos = items.filter((it) => !it.anulado);
        // Cada línea pesa lo que cuesta CON su IVA: con tasas distintas (o precios con IVA incluido) repartir por el
        // subtotal sin IVA cobraría de más o de menos a quien paga la línea exenta.
        const sumaItems = vivos.reduce((s, it) => s + pesoDeItem(it), 0);
        const factor = sumaItems > 0 ? total / sumaItems : 1;
        const seleccion = this.round2(indices.reduce((s, idx) => s + pesoDeItem(items[idx]), 0) * factor);
        const quedanSinCobrar = vivos.length - yaPagados.size - indices.length;
        monto = quedanSinCobrar === 0 ? saldo : seleccion;
      } else if (data.monto !== undefined) {
        monto = this.round2(Number(data.monto));
        if (!Number.isFinite(monto) || monto <= 0) {
          throw new BadRequestException('monto debe ser mayor a cero.');
        }
      } else {
        monto = saldo;
      }
      if (monto > saldo) {
        throw new BadRequestException(`El monto (${monto}) excede el saldo pendiente (${saldo}).`);
      }

      // Dividir = cualquier cobro que no liquide la cuenta completa de una vez: ya hay pagos antes, o este no
      // cubre todo el saldo (monto parcial, por persona o por ítems). El último pago de una cuenta dividida también.
      const esDividido = pagos.length > 0 || monto < saldo;
      if (actor && esDividido && !puedeDividir(actor, politicaCobro!, politicaDivision!)) {
        throw new ForbiddenException(
          'Dividir la cuenta no está permitido para tu rol con la política de este negocio. Pide a un gerente que la divida o cobra la cuenta completa de una vez.',
        );
      }

      const entrada: NonNullable<Sale['formasPago']>[number] = {
        forma: data.formaPago as any,
        monto,
        ...(actor
          ? {
              cobradoPorId: actor.id,
              cobradoPorEmail: actor.email,
              cobradoPorRol: actor.roleCode,
              origen: contextoCobro(actor),
              ...(esDividido ? { dividido: true, divididoPorId: actor.id, divididoPorEmail: actor.email } : {}),
            }
          : {}),
        ...(indices ? { itemIndexes: indices } : {}),
        ...(data.montoRecibido !== undefined ? { montoRecibido: Number(data.montoRecibido) } : {}),
        ...(data.cambio !== undefined ? { cambio: Number(data.cambio) } : {}),
        ...(data.ultimos4Digitos ? { ultimos4Digitos: data.ultimos4Digitos } : {}),
        ...(data.folioVoucher ? { folioVoucher: data.folioVoucher } : {}),
        ...(data.claveRastreo ? { claveRastreo: data.claveRastreo } : {}),
        ...(data.bancoOrigen ? { bancoOrigen: data.bancoOrigen } : {}),
        ...(data.motivo ? { motivo: data.motivo } : {}),
        ...(data.formaPago === 'CORTESIA' ? { autorizadoPor: this.autorizadoPorDe(actor) } : {}),
      };
      pagos.push(entrada);

      const nuevoSaldo = this.round2(total - this.sumPagos(pagos));
      const cerrada = nuevoSaldo <= 0;
      if (cerrada) {
        await manager.update(Sale, id, {
          formasPago: pagos,
          formaPago: pagos[0].forma,
          status: 'PAGADA',
          montoRecibido: this.round2(pagos.reduce((s, p) => s + (p.montoRecibido ?? p.monto), 0)),
          cambio: this.round2(pagos.reduce((s, p) => s + (p.cambio ?? 0), 0)),
        });
        if (sale.citaId) {
          await this.appointmentsService.completarPorVenta(sale.citaId, t, manager);
        }
        await this.liberarMesa(manager, { tableId: sale.tableId, tenantId: t });
      } else {
        await manager.update(Sale, id, { formasPago: pagos });
      }

      const actualizada = await manager.findOne(Sale, { where: { id } });
      return { sale: actualizada, pagado: this.sumPagos(pagos), saldoPendiente: Math.max(nuevoSaldo, 0), cerrada };
    });
  }

  async pay(id: string, data: {
    formaPago: string;
    montoRecibido: number;
    cambio: number;
  }, tenantId?: string, actor?: Actor) {
    const FORMAS_PAY = ['EFECTIVO', 'TARJETA', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'CORTESIA'];
    if (!data || !FORMAS_PAY.includes(data.formaPago)) {
      throw new BadRequestException('formaPago inválida.');
    }
    if (data.formaPago === 'CORTESIA') this.assertCortesiaPermitida(actor);
    try {
      const sale = await this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'ABIERTA') {
        throw new Error('La venta ya no está abierta');
      }
      // Cuenta abierta con cobros parciales (mesas_cuenta_abierta): este cobro de un solo pago
      // sobrescribiría formasPago y descuadraría el saldo — se liquida con cobrarCuenta().
      if (this.sumPagos(sale.formasPago) > 0) {
        throw new Error('La cuenta tiene pagos parciales: cobra el saldo desde el cobro de cuenta abierta (/pagos).');
      }

      const cambiosPago: Record<string, any> = {
        formaPago: data.formaPago as any,
        montoRecibido: data.montoRecibido,
        cambio: data.cambio,
        status: 'PAGADA' as const,
      };

      // Mesa ocupada por esta cuenta (mesas_cuenta_abierta): se libera al cobrar. Solo se consulta
      // la capacidad si la venta tiene tableId — una venta sin mesa no paga ninguna consulta extra.
      const liberaMesa = !!(
        sale.tableId &&
        sale.tenantId &&
        (await this.tenantSettingsService.hasPosCapability(sale.tenantId, 'mesas_cuenta_abierta'))
      );

      // Este endpoint también cobra una cuenta de mesa completa: pasa por la misma política de cobro que
      // cobrarCuenta() (si no, un mesero se saltaría SOLO_CAJA) y deja quién cobró para el corte por persona.
      if (liberaMesa && actor) {
        const politicaCobro = await this.tenantSettingsService.getPoliticaCobro(sale.tenantId as string);
        if (!puedeCobrar(actor, politicaCobro)) {
          throw new ForbiddenException(
            contextoCobro(actor) === 'MESA' && politicaCobro === 'SOLO_CAJA'
              ? 'Con la política de cobro de este negocio las cuentas solo se cobran en caja. Pasa la cuenta a caja.'
              : 'Tu rol no puede cobrar cuentas desde mesa con la política de cobro de este negocio. Pasa la cuenta a caja.',
          );
        }
        cambiosPago.formasPago = [{
          forma: data.formaPago as any,
          monto: this.round2(Number(sale.total)),
          cobradoPorId: actor.id,
          cobradoPorEmail: actor.email,
          cobradoPorRol: actor.roleCode,
          origen: contextoCobro(actor),
          ...(data.formaPago === 'CORTESIA' ? { autorizadoPor: this.autorizadoPorDe(actor) } : {}),
          ...(data.montoRecibido !== undefined ? { montoRecibido: Number(data.montoRecibido) } : {}),
          ...(data.cambio !== undefined ? { cambio: Number(data.cambio) } : {}),
        }];
      } else if (data.formaPago === 'CORTESIA') {
        // Sin mesa: la cortesía también deja constancia de quién la autorizó (el corte la cuenta desde formasPago).
        cambiosPago.formasPago = [{
          forma: 'CORTESIA' as const,
          monto: this.round2(Number(sale.total)),
          autorizadoPor: this.autorizadoPorDe(actor),
          ...(actor ? { cobradoPorId: actor.id, cobradoPorEmail: actor.email, cobradoPorRol: actor.roleCode, origen: contextoCobro(actor) } : {}),
        }];
      }

      if ((sale.citaId && sale.tenantId) || liberaMesa) {
        // Venta ligada a una cita (capacidad ligar_venta_a_cita, validada al crearla) y/o a una
        // mesa: el cobro, la transición de la cita a COMPLETADA y la liberación de la mesa van
        // en la misma transacción.
        await this.dataSource.transaction(async (manager) => {
          await manager.update(Sale, id, cambiosPago);
          if (sale.citaId && sale.tenantId) {
            await this.appointmentsService.completarPorVenta(sale.citaId as string, sale.tenantId, manager);
          }
          if (liberaMesa) await this.liberarMesa(manager, sale);
        });
      } else {
        await this.salesRepo.update(id, cambiosPago);
      }

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.pay error:', error);
      if (error instanceof HttpException) throw error;
      throw new Error(`Error al procesar pago: ${error.message}`);
    }
  }

  async cancel(id: string, motivo: string, tenantId?: string, actor?: Actor) {
    try {
      const sale = await this.salesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status === 'CANCELADA') {
        throw new Error('La venta ya está cancelada');
      }
      // Cancelar solo aplica a una cuenta ABIERTA (sin cobrar). Una venta ya cobrada (PAGADA), una
      // ya devuelta (DEVUELTA) o el registro de una devolución (DEVOLUCION) no se cancelan: cancelar
      // no devuelve stock ni dinero y descuadra el corte. Para una venta cobrada: returnSale().
      if (sale.status !== 'ABIERTA') {
        throw new BadRequestException(
          sale.status === 'PAGADA'
            ? 'Una venta ya cobrada no se cancela: usa la devolución para regresar el inventario y el dinero.'
            : `Una venta en estado ${sale.status} no se puede cancelar.`,
        );
      }
      // Cuenta abierta con cobros parciales: cancelarla dejaría dinero cobrado sin venta que lo
      // respalde — hay que resolver esos pagos (reembolso) antes.
      if (sale.status === 'ABIERTA' && this.sumPagos(sale.formasPago) > 0) {
        throw new BadRequestException('La cuenta tiene pagos parciales; no se puede cancelar');
      }

      const liberaMesa = !!(
        sale.tableId &&
        sale.tenantId &&
        sale.status === 'ABIERTA' &&
        (await this.tenantSettingsService.hasPosCapability(sale.tenantId, 'mesas_cuenta_abierta'))
      );
      // El mesero solo cancela cuentas de mesa (la regla de ítems enviados se aplica dentro de la transacción).
      if (actor?.roleCode === 'MESERO' && !liberaMesa) {
        throw new ForbiddenException('El mesero solo puede cancelar cuentas de mesa.');
      }
      if (liberaMesa) {
        // Cuenta abierta de mesa: devuelve stock de lo que no salió a cocina/barra, registra merma
        // de lo que sí salió, cancela notas pendientes y libera la mesa (una sola transacción).
        await this.cancelarCuentaAbierta(id, motivo, sale.tenantId, actor);
      } else {
        await this.salesRepo.update(id, {
          status: 'CANCELADA',
          motivoCancelacion: motivo,
        });
      }

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.cancel error:', error);
      if (error instanceof HttpException) throw error;
      throw new Error(`Error al cancelar venta: ${error.message}`);
    }
  }

  async applyDiscount(id: string, descuento: number, nuevoTotal: number, tenantId?: string, actor?: Actor) {
    // El mesero no aplica descuentos (el controller siempre pasa el usuario; sin rol reconocido también es 403).
    if (actor && !ROLES_DESCUENTO.includes(actor.roleCode ?? '')) {
      throw new ForbiddenException('Tu rol no puede aplicar descuentos. Pide a un capitán o gerente.');
    }
    // Números inválidos: se rechazan antes de abrir la transacción (no necesitan la venta).
    const desc = Number(descuento);
    const nuevo = Number(nuevoTotal);
    if (!Number.isFinite(desc) || desc < 0 || !Number.isFinite(nuevo) || nuevo < 0) {
      throw new BadRequestException('descuento y nuevoTotal deben ser números mayores o iguales a cero.');
    }
    try {
      // Una sola transacción con lock sobre la venta (igual que cobrarCuenta): un cobro parcial concurrente espera el
      // lock y, al entrar, este descuento ve los pagos ya guardados y se rechaza; o al revés, el cobro ve el nuevo total.
      // Antes se leía sin lock y el cobro parcial podía colarse entre la lectura y la escritura.
      return await this.dataSource.transaction(async (manager) => {
        const sale = await manager.findOne(Sale, { where: tenantId ? { id, tenantId } : { id }, lock: { mode: 'pessimistic_write' } });
        if (!sale) {
          throw new Error('Venta no encontrada');
        }
        if (sale.status !== 'ABIERTA') {
          throw new Error('Solo se puede aplicar descuento a ventas abiertas');
        }
        if (this.sumPagos(sale.formasPago) > 0) {
          throw new Error('No se puede aplicar descuento a una cuenta con pagos parciales ya cobrados.');
        }
        // Un descuento no sube el total ni lo deja negativo (antes el total llegaba tal cual del cliente).
        if (nuevo > Number(sale.total)) {
          throw new BadRequestException('El nuevo total no puede ser mayor al total actual de la cuenta.');
        }

        // Importe sin descuento de la cuenta (total con IVA que ve el cliente), recalculado desde sus ítems con la tasa con
        // que se vendieron. nuevoTotal tiene que cuadrar con descuento: si no, el tope por rol se evadiría mandando un
        // descuento chico y un total en cero. Una venta sin ítems (dato viejo) cae al total + descuento guardados.
        const pre = totalesDeItems(sale.items || []);
        const base = pre.total > 0 ? pre.total : this.round2(Number(sale.total) + Number(sale.descuento ?? 0));
        const esperado = this.round2(base - desc);
        if (Math.abs(esperado - nuevo) > 0.01) {
          throw new BadRequestException(`El nuevo total (${nuevo}) no cuadra con el descuento: ${base} − ${desc} = ${esperado}.`);
        }
        const tope = topeDescuentoPct(actor?.roleCode);
        if (actor && desc > this.round2((base * tope) / 100)) {
          throw new ForbiddenException(this.mensajeTopeDescuento(actor.roleCode, tope, base > 0 ? (desc / base) * 100 : 100));
        }

        // El descuento de cuenta es sobre el total con IVA: el IVA baja en la misma proporción (igual que si cada ítem
        // hubiera llevado ese descuento), y `descuento` queda en base sin IVA, así subtotal − descuento + impuestos = total.
        const k = base > 0 ? esperado / base : 0;
        const impuestosPre = pre.total > 0 ? pre.impuestos : Number(sale.impuestos) || 0;
        const subtotalPre = pre.total > 0 ? pre.subtotal : Number(sale.subtotal) || 0;
        const impuestosNuevos = this.round2(impuestosPre * k);
        await manager.update(Sale, id, {
          descuento: this.round2(subtotalPre - (esperado - impuestosNuevos)),
          impuestos: impuestosNuevos,
          total: esperado,
        });

        return manager.findOne(Sale, { where: { id } });
      });
    } catch (error) {
      console.error('SalesService.applyDiscount error:', error);
      if (error instanceof HttpException) throw error;
      throw new Error(`Error al aplicar descuento: ${error.message}`);
    }
  }

  // Devolución TOTAL de una venta PAGADA. Solo se acepta el motivo: ítems e importes se calculan
  // desde la venta original (nada que el cliente pueda inflar). Una sola transacción con lock
  // sobre la original: stock, merma, notas, marca de "devuelta" y registro de la devolución se
  // confirman o se revierten juntos.
  //  - Ítems sin notaCocinaId → regresan al inventario por la cadena de Costos (restoreInventory).
  //  - Ítems que ya salieron a cocina/barra → no regresan; merma en MERMAS_FALTANTES.
  //  - Corte Z: la original pasa a 'DEVUELTA' (sigue contando como venta bruta de SU turno) y la
  //    devolución se registra como una venta 'DEVOLUCION' en el turno abierto actual, con las mismas
  //    formasPago: el corte la suma en totalDevoluciones y la resta del efectivo/tarjeta/transferencia.
  //  - No repetible: la original deja de estar PAGADA (y folio `${folio}-DEV` es único).
  //  - Quién puede: política del tenant (TenantSetting, default SOLO_GERENTE) → con SOLO_GERENTE
  //    exige roleCode ADMIN o GERENTE; con CAJERO_LIBRE cualquier usuario autenticado del POS.
  //    Rechazo 403. Quien ejecutó queda en la devolución (notas y formasPago[].autorizadoPor).
  async getPoliticaDevolucionesParaUsuario(tenantId: string | undefined, actor?: Actor) {
    if (!tenantId) throw new ForbiddenException('Se requiere un tenant.');
    const politica = await this.tenantSettingsService.getPoliticaDevoluciones(tenantId);
    return { politicaDevoluciones: politica, puedeDevolver: this.puedeDevolver(politica, actor) };
  }

  // Turno al que pertenece una cuenta de mesa. Con turnoId (el POS manda su turno actual): debe ser un turno ABIERTO
  // del tenant y de la sucursal. Sin turnoId: el turno abierto más reciente de la sucursal. Sin turno abierto, 400:
  // sin turno, el efectivo cobrado en mesa no entraría a ningún corte.
  private async resolverTurnoDeCuenta(manager: EntityManager, turnoId: string | undefined, sucursalId: string, tenantId: string): Promise<Shift> {
    if (turnoId) {
      const pedido = await manager.findOne(Shift, { where: { id: turnoId, tenantId } });
      if (!pedido || pedido.status !== 'ABIERTO' || pedido.sucursalId !== sucursalId) {
        throw new BadRequestException('El turno indicado no es un turno abierto de esta sucursal.');
      }
      return pedido;
    }
    const turno = await manager.findOne(Shift, { where: { tenantId, sucursalId, status: 'ABIERTO' }, order: { createdAt: 'DESC' } });
    if (!turno) {
      throw new BadRequestException('No hay un turno abierto en esta sucursal: abre turno antes de abrir cuentas de mesa.');
    }
    return turno;
  }

  // Informativo para el POS (mostrar u ocultar botones): políticas vigentes y qué puede hacer ESTE usuario con
  // las cuentas de mesa. Es solo informativo: cobrarCuenta(), quitarItem() y cancel() vuelven a decidir.
  async getPoliticasMesasParaUsuario(tenantId: string | undefined, actor?: Actor) {
    if (!tenantId) throw new ForbiddenException('Se requiere un tenant.');
    const [politicaCobro, politicaDivisionCuentas] = await Promise.all([
      this.tenantSettingsService.getPoliticaCobro(tenantId),
      this.tenantSettingsService.getPoliticaDivisionCuentas(tenantId),
    ]);
    const rol = actor?.roleCode ?? null;
    return {
      politicaCobro,
      politicaDivisionCuentas,
      rol,
      contexto: contextoCobro(actor),
      puedeCobrar: puedeCobrar(actor, politicaCobro),
      puedeDividir: puedeDividir(actor, politicaCobro, politicaDivisionCuentas),
      // El mesero solo quita ítems que no salieron a cocina y solo cancela cuentas sin ítems enviados ni pagos.
      soloQuitaSinCocina: rol === 'MESERO',
    };
  }

  private puedeDevolver(politica: PoliticaDevolucion, actor?: Actor): boolean {
    return politica === 'CAJERO_LIBRE' || ROLES_GERENTE.includes(actor?.roleCode ?? '');
  }

  async returnSale(id: string, data: { motivo?: string; turnoId?: string } | undefined, tenantId?: string, actor?: Actor) {
    if (!tenantId) {
      throw new ForbiddenException('Se requiere un tenant para devolver una venta.');
    }
    const politica = await this.tenantSettingsService.getPoliticaDevoluciones(tenantId);
    if (!this.puedeDevolver(politica, actor)) {
      throw new ForbiddenException('La política de devoluciones de este negocio solo permite devolver a un gerente o administrador. Pide a un gerente que la realice.');
    }
    const quien = actor?.email ?? actor?.id ?? 'desconocido';
    const motivo = String(data?.motivo ?? '').trim();
    if (!motivo) {
      throw new BadRequestException('El motivo de la devolución es requerido.');
    }
    // turnoId opcional: el POS manda su turno actual para que la devolución caiga en SU caja aunque la
    // sucursal tenga otros turnos abiertos. Sin él se usa el más reciente de la sucursal.
    const turnoIdPedido = data?.turnoId;
    if (turnoIdPedido !== undefined && (typeof turnoIdPedido !== 'string' || !turnoIdPedido.trim())) {
      throw new BadRequestException('turnoId inválido.');
    }
    const ventaServicioHabilitada = await this.tenantSettingsService.hasPosCapability(tenantId, 'venta_de_servicio');

    return this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      // Las ventas de delivery no pasaron por caja ni por un turno (turnoId nulo) y su ingreso entró
      // como movimiento bancario: devolverlas aquí descontaría dinero de un turno que nunca lo tuvo y
      // dejaría el ingreso sin revertir. Se devuelven desde la plataforma.
      if (sale.origin === 'DELIVERY') {
        throw new BadRequestException('Las ventas de delivery no se devuelven desde el POS: se devuelven desde la plataforma de delivery.');
      }
      if (sale.status === 'DEVUELTA') throw new BadRequestException('Esta venta ya fue devuelta.');
      // Las filas "-DEV" negativas del esquema anterior siguen siendo PAGADA: no son devolvibles.
      if (sale.status !== 'PAGADA' || Number(sale.total) <= 0) {
        throw new BadRequestException('Solo se puede devolver ventas pagadas');
      }

      let turno: Shift | null;
      if (turnoIdPedido !== undefined) {
        // Turno elegido por quien devuelve: debe ser un turno ABIERTO de este tenant y de la MISMA
        // sucursal que la venta. Un solo mensaje para todo rechazo: no revela si el id existe en
        // otro tenant o sucursal.
        turno = await manager.findOne(Shift, { where: { id: turnoIdPedido.trim(), tenantId } });
        if (!turno || turno.status !== 'ABIERTO' || turno.sucursalId !== sale.sucursalId) {
          throw new BadRequestException('El turno indicado no es un turno abierto de la sucursal de esta venta.');
        }
      } else {
        turno = await manager.findOne(Shift, {
          where: { tenantId, sucursalId: sale.sucursalId, status: 'ABIERTO' },
          order: { createdAt: 'DESC' },
        });
        if (!turno) {
          throw new BadRequestException('No hay un turno abierto en esta sucursal: abre turno antes de devolver una venta.');
        }
      }

      const devFolio = `${sale.folio}-DEV`;
      const vivos = (sale.items || []).filter((it) => !it.anulado);
      const aDevolver = vivos.filter((it) => !it.notaCocinaId);
      const aMerma = vivos.filter((it) => !!it.notaCocinaId);

      await this.restoreInventory(manager, aDevolver, devFolio, tenantId, sale.sucursalId, ventaServicioHabilitada, 'ENTRADA_DEVOLUCION');
      if (aMerma.length > 0) {
        const monto = await this.calculateCostoReal(aMerma, tenantId, ventaServicioHabilitada);
        await this.registrarMerma(manager, sale, aMerma, monto, `Devolución de la venta ${sale.folio}: ítems que ya salieron a cocina/barra`);
      }
      await manager.update(NotaCocina, { saleId: id, estado: 'PENDIENTE' }, { estado: 'CANCELADA' });

      // Cómo se cobró la original: pagos mixtos (formasPago) o un solo pago (formaPago por el total).
      const pagos = Array.isArray(sale.formasPago) && sale.formasPago.length > 0
        ? sale.formasPago.map((p) => ({ forma: p.forma, monto: this.round2(Number(p.monto) || 0), autorizadoPor: quien }))
        : [{ forma: sale.formaPago, monto: this.round2(Number(sale.total)), autorizadoPor: quien }];

      const now = new Date();
      const devolucion = manager.create(Sale, {
        folio: devFolio,
        fecha: now,
        hora: now.toTimeString().slice(0, 8),
        items: vivos,
        subtotal: sale.subtotal,
        descuento: sale.descuento,
        impuestos: sale.impuestos,
        total: sale.total,
        formaPago: pagos[0].forma,
        formasPago: pagos,
        status: 'DEVOLUCION',
        cajero: turno.cajero,
        turnoId: turno.id,
        sucursalId: sale.sucursalId,
        tenantId,
        notas: `Devolución de venta ${sale.folio}. Motivo: ${motivo}. Devolvió: ${quien} (${actor?.roleCode ?? 'sin rol'})`,
        referencia: sale.folio,
      });
      const guardada = await manager.save(devolucion);
      await manager.update(Sale, id, { status: 'DEVUELTA' });
      // Gimnasio: devolver la venta de una membresía cancela ese periodo (en la misma transacción de la devolución).
      if (this.membresiasCore) {
        await this.membresiasCore.cancelarPorVenta(manager, id, tenantId, `Devolución de la venta ${sale.folio}: ${motivo}`);
      }
      return guardada;
    });
  }
}
