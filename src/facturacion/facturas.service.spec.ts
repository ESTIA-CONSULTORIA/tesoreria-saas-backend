import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { FacturasController } from './facturas.controller';
import { MockPacProvider } from './pac/mock-pac.provider';
import { PacError } from './pac/pac.types';
import { ROLES_KEY } from '../auth/roles.decorator';

const A = 'tenant-A';
const B = 'tenant-B';

const valoresIn = (v: any): string[] => (v && v._value ? v._value : [v]);
const coincide = (f: any, where: any) => Object.entries(where).every(([k, v]: [string, any]) => (v && v._type === 'in' ? valoresIn(v).includes(f[k]) : f[k] === v));

function repo<T extends Record<string, any>>(filas: T[]) {
  let seq = 0;
  return {
    filas,
    find: jest.fn(async ({ where }: any = {}) => filas.filter((f) => coincide(f, where ?? {}))),
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
    create: jest.fn((d: any) => ({ createdAt: new Date(), ...d })),
    save: jest.fn(async (d: any) => {
      const hay = d.id ? filas.find((f) => f.id === d.id) : undefined;
      if (hay) return Object.assign(hay, d);
      const nueva = { ...d, id: d.id ?? `id-${++seq}-${filas.length}` };
      filas.push(nueva);
      return nueva;
    }),
  };
}

// Servicio de prueba: el total cobrado y el folio no usan SQL.
class Servicio extends FacturasService {
  cobrado = { ventas: 0, total: 0 };
  protected async totalCobrado() {
    return this.cobrado;
  }
}

const itemsVenta = [
  { productoId: 'p-agua', nombre: 'Agua 600 ml', cantidad: 2, precioUnitario: 20, descuento: 0, subtotal: 40, tasaIva: '16' },
  { productoId: 'p-pase', nombre: 'Pase de día', cantidad: 1, precioUnitario: 100, descuento: 0, subtotal: 100, tasaIva: '16' },
];

function montar(opts: { pac?: MockPacProvider; conClaves?: boolean } = {}) {
  const contadores = new Map<string, number>();
  const series = { ...repo<any>([]), query: jest.fn(async (_sql: string, [, companyId, tipo, serie]: string[]) => {
    const k = `${companyId}|${tipo}|${serie}`;
    contadores.set(k, (contadores.get(k) ?? 0) + 1);
    return [{ folioActual: contadores.get(k) }];
  }) };
  const r = {
    facturas: repo<any>([]),
    enlaces: repo<any>([]),
    eventos: repo<any>([]),
    series,
    emisores: repo<any>([
      { id: 'em-A', tenantId: A, companyId: 'co-A', rfc: 'EKU9003173C9', nombreFiscal: 'ESCUELA KEMPER URGATE', regimenFiscal: '601', serie: 'A' },
      { id: 'em-B', tenantId: B, companyId: 'co-B', rfc: 'XIQB891116QE4', nombreFiscal: 'OTRO', regimenFiscal: '612', serie: null },
    ]),
    sucursalesFiscal: repo<any>([
      { tenantId: A, branchId: 'br-A', codigoPostalExpedicion: '21000' },
      { tenantId: B, branchId: 'br-B', codigoPostalExpedicion: '22000' },
    ]),
    productosFiscal: repo<any>(
      opts.conClaves === false
        ? []
        : [
            { tenantId: A, productId: 'p-agua', claveProdServ: '50202301', claveUnidad: 'H87', unidadNombre: 'Pieza', objetoImp: '02' },
            { tenantId: A, productId: 'p-pase', claveProdServ: '80141600', claveUnidad: 'E48', unidadNombre: 'Servicio', objetoImp: '02' },
          ],
    ),
    receptores: repo<any>([
      { id: 'rec-A', tenantId: A, rfc: 'XIQB891116QE4', nombreFiscal: 'BERTHA XIMENEZ QUINTERO', codigoPostal: '21000', regimenFiscal: '612' },
      { id: 'rec-B', tenantId: B, rfc: 'EKU9003173C9', nombreFiscal: 'DE OTRO NEGOCIO', codigoPostal: '22000', regimenFiscal: '601' },
      { id: 'rec-pub', tenantId: A, rfc: 'XAXX010101000', nombreFiscal: 'PUBLICO EN GENERAL', codigoPostal: '21000', regimenFiscal: '616' },
    ]),
    ventas: repo<any>([
      { id: 'v-A', tenantId: A, folio: 'VTA-1', status: 'PAGADA', sucursalId: 'br-A', items: itemsVenta, subtotal: 140, impuestos: 22.4, total: 162.4, formaPago: 'EFECTIVO', formasPago: [{ forma: 'EFECTIVO', monto: 162.4 }] },
      { id: 'v-A2', tenantId: A, folio: 'VTA-2', status: 'PAGADA', sucursalId: 'br-A', items: itemsVenta, subtotal: 140, impuestos: 22.4, total: 162.4, formaPago: 'EFECTIVO', formasPago: [{ forma: 'EFECTIVO', monto: 162.4 }] },
      { id: 'v-B', tenantId: B, folio: 'VTA-9', status: 'PAGADA', sucursalId: 'br-B', items: itemsVenta, subtotal: 140, impuestos: 22.4, total: 162.4, formaPago: 'EFECTIVO' },
      { id: 'v-abierta', tenantId: A, folio: 'VTA-3', status: 'ABIERTA', sucursalId: 'br-A', items: itemsVenta, subtotal: 140, impuestos: 22.4, total: 162.4 },
    ]),
    branches: repo<any>([
      { id: 'br-A', companyId: 'co-A' },
      { id: 'br-B', companyId: 'co-B' },
    ]),
    companies: repo<any>([
      { id: 'co-A', tenantId: A },
      { id: 'co-B', tenantId: B },
    ]),
  };
  const pac = opts.pac ?? new MockPacProvider({ ahora: () => new Date('2026-10-18T12:00:00Z') });
  const svc = new Servicio(r.facturas as any, r.enlaces as any, r.eventos as any, r.series as any, r.emisores as any, r.sucursalesFiscal as any, r.productosFiscal as any, r.receptores as any, r.ventas as any, r.branches as any, r.companies as any, pac);
  return { svc, r, pac };
}

const actor = { email: 'gerente@x' };
const input = { receptorId: 'rec-A', usoCfdi: 'G03' };

describe('Facturas F1 — factura desde caja', () => {
  it('timbra con el Mock, queda marcada SIN validez fiscal, con serie/folio y bitácora', async () => {
    const { svc, r } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(f).toMatchObject({ tipo: 'I', estado: 'TIMBRADO', serie: 'A', folio: 1, total: 162.4, sinValidezFiscal: true, reutilizada: false });
    expect(f.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.facturas.filas[0]).toMatchObject({ sinValidezFiscal: true, claveIdempotencia: 'venta:v-A:1', creadoPor: 'gerente@x' });
    expect(r.facturas.filas[0].xmlHash).toHaveLength(64);
    expect(r.enlaces.filas[0]).toMatchObject({ ventaId: 'v-A', activa: true });
    expect(r.eventos.filas.map((e: any) => e.evento)).toEqual(['CREADA', 'TIMBRADO_SOLICITADO', 'TIMBRADO']);
  });

  it('candado anti-doble facturación: la misma venta devuelve la misma factura y no gasta otro folio', async () => {
    const { svc, r } = montar();
    const a = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    const b = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(b.id).toBe(a.id);
    expect(b.reutilizada).toBe(true);
    expect(r.facturas.filas).toHaveLength(1);
    expect(r.series.query).toHaveBeenCalledTimes(1);
  });

  it('folios consecutivos por serie entre ventas distintas', async () => {
    const { svc } = montar();
    expect((await svc.crearDesdeVenta(A, 'v-A', input, actor)).folio).toBe(1);
    expect((await svc.crearDesdeVenta(A, 'v-A2', input, actor)).folio).toBe(2);
  });

  it('sin claves SAT de producto → 422 con la lista de errores; no se crea nada ni se gasta folio', async () => {
    const { svc, r } = montar({ conClaves: false });
    await expect(svc.crearDesdeVenta(A, 'v-A', input, actor)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await svc.crearDesdeVenta(A, 'v-A', input, actor).catch((e) => expect(JSON.stringify(e.getResponse())).toMatch(/Falta la clave SAT/));
    expect(r.facturas.filas).toHaveLength(0);
    expect(r.series.query).not.toHaveBeenCalled();
  });

  it('venta abierta, receptor de público en general o uso inválido: no se factura', async () => {
    const { svc } = montar();
    await expect(svc.crearDesdeVenta(A, 'v-abierta', input, actor)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(svc.crearDesdeVenta(A, 'v-A', { receptorId: 'rec-pub', usoCfdi: 'S01' }, actor)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(svc.crearDesdeVenta(A, 'v-A', { receptorId: 'rec-A', usoCfdi: 'ZZZ' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.crearDesdeVenta(A, 'v-A', {}, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falta de emisor o de CP de expedición: 422 accionable', async () => {
    const { svc, r } = montar();
    r.emisores.filas.splice(0, 1);
    await expect(svc.crearDesdeVenta(A, 'v-A', input, actor)).rejects.toThrow(/datos fiscales del emisor/);
    const m = montar();
    m.r.sucursalesFiscal.filas.splice(0, 1);
    await expect(m.svc.crearDesdeVenta(A, 'v-A', input, actor)).rejects.toThrow(/código postal de expedición/);
  });

  it('timeout del proveedor → INCIERTO; la venta sigue bloqueada para doble factura; reintentar consulta primero y NO re-timbra a ciegas', async () => {
    const pac = new MockPacProvider({ fallarTimbrado: true });
    const { svc, r } = montar({ pac });
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(f.estado).toBe('INCIERTO');
    expect(r.enlaces.filas[0].activa).toBe(true);
    // otra solicitud sobre la misma venta devuelve la factura incierta, no crea otra
    expect((await svc.crearDesdeVenta(A, 'v-A', input, actor)).id).toBe(f.id);
    expect(r.facturas.filas).toHaveLength(1);

    // El proveedor ya la había timbrado (la respuesta se perdió): reintentar la recupera por referencia.
    const ya = await new MockPacProvider({ ahora: () => new Date('2026-10-18T12:00:00Z') }).timbrar(r.facturas.filas[0].entrada, 'venta:v-A:1');
    jest.spyOn(pac, 'consultarPorReferencia').mockResolvedValue(ya);
    const timbrar = jest.spyOn(pac, 'timbrar');
    const rec = await svc.reintentar(A, f.id, actor);
    expect(rec).toMatchObject({ estado: 'TIMBRADO', uuid: ya.uuid });
    expect(timbrar).not.toHaveBeenCalledWith(expect.anything(), 'venta:v-A:1'); // no se volvió a timbrar
  });

  it('INCIERTO sin rastro en el proveedor: reintenta con la MISMA clave de idempotencia', async () => {
    const pac = new MockPacProvider({ ahora: () => new Date('2026-10-18T12:00:00Z') });
    const { svc, r } = montar({ pac });
    jest.spyOn(pac, 'timbrar').mockRejectedValueOnce(new Error('timeout de red'));
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(f.estado).toBe('INCIERTO');
    const rec = await svc.reintentar(A, f.id, actor);
    expect(rec.estado).toBe('TIMBRADO');
    expect(pac.timbrar).toHaveBeenLastCalledWith(expect.anything(), 'venta:v-A:1');
    expect(r.facturas.filas).toHaveLength(1);
    await expect(svc.reintentar(A, f.id, actor)).rejects.toBeInstanceOf(BadRequestException); // ya no es INCIERTO
  });

  it('rechazo del proveedor → ERROR_VALIDACION, libera la venta y un nuevo intento usa otra clave', async () => {
    const pac = new MockPacProvider();
    const { svc, r } = montar({ pac });
    jest.spyOn(pac, 'timbrar').mockRejectedValueOnce(new PacError('RFC_RECEPTOR_INVALIDO', 'El RFC del receptor no es válido.'));
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(f).toMatchObject({ estado: 'ERROR_VALIDACION', errorMensaje: 'El RFC del receptor no es válido.' });
    expect(r.enlaces.filas[0].activa).toBe(false);
    const otra = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(otra).toMatchObject({ estado: 'TIMBRADO', reutilizada: false });
    expect(r.facturas.filas.map((x: any) => x.claveIdempotencia)).toEqual(['venta:v-A:1', 'venta:v-A:2']);
  });
});

describe('Facturas F1 — aislamiento por tenant', () => {
  it('otro negocio no puede facturar, ver ni cancelar lo de este', async () => {
    const { svc } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    await expect(svc.crearDesdeVenta(B, 'v-A', { receptorId: 'rec-B', usoCfdi: 'G03' }, actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.obtener(B, f.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.cancelar(B, f.id, { motivo: '02' }, actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.notaCredito(B, f.id, { motivo: 'x' }, actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reintentar(B, f.id, actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.refrescarEstatus(B, f.id, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect((await svc.listar(B)).total).toBe(0);
    expect((await svc.listar(A)).total).toBe(1);
  });

  it('un receptor de otro negocio no se puede usar', async () => {
    const { svc } = montar();
    await expect(svc.crearDesdeVenta(A, 'v-A', { receptorId: 'rec-B', usoCfdi: 'G03' }, actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('la sucursal de la venta debe ser de una empresa del mismo tenant (el emisor sale de la venta, nunca del cliente)', async () => {
    const { svc, r } = montar();
    r.ventas.filas.find((v: any) => v.id === 'v-A').sucursalId = 'br-B'; // sucursal de otro negocio
    await expect(svc.crearDesdeVenta(A, 'v-A', input, actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el listado y el detalle muestran el nombre del receptor, no ids, y nunca el XML ni la entrada completa', async () => {
    const { svc } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    const lista = await svc.listar(A);
    expect(lista.filas[0].receptor).toEqual({ rfc: 'XIQB891116QE4', nombreFiscal: 'BERTHA XIMENEZ QUINTERO' });
    expect(lista.sinValidezFiscal).toBe(true);
    expect(JSON.stringify(lista)).not.toMatch(/<cfdi:|SIMULADO/);
    const d: any = await svc.obtener(A, f.id);
    expect(d.eventos.length).toBeGreaterThan(0);
    expect(d.conceptos).toHaveLength(2);
    expect(JSON.stringify(d)).not.toMatch(/<cfdi:|SIMULADO/);
  });
});

describe('Facturas F1 — nota de crédito', () => {
  it('total: egreso relacionado al UUID original, uso G02, serie NC', async () => {
    const { svc, r } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    const nc = await svc.notaCredito(A, f.id, { motivo: 'Devolución de mercancía' }, actor);
    expect(nc).toMatchObject({ tipo: 'E', estado: 'TIMBRADO', serie: 'NC', folio: 1, total: 162.4, sinValidezFiscal: true, relacionadaFacturaId: f.id });
    const fila = r.facturas.filas.find((x: any) => x.id === nc.id);
    expect(fila).toMatchObject({ relacionadoUuid: f.uuid, tipoRelacion: '01', usoCfdi: 'G02', conceptosAcreditados: [0, 1] });
  });

  it('parcial y luego el resto; no permite acreditar dos veces la misma partida', async () => {
    const { svc } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    const n1 = await svc.notaCredito(A, f.id, { partidas: [1], motivo: 'Devolvieron el pase' }, actor);
    expect(n1.total).toBe(116);
    await expect(svc.notaCredito(A, f.id, { partidas: [1, 0], motivo: 'otra vez' }, actor)).rejects.toThrow(/ya tienen nota/);
    const n2 = await svc.notaCredito(A, f.id, { partidas: [0], motivo: 'Devolvieron el agua' }, actor);
    expect(n2.total).toBe(46.4);
  });

  it('idempotente: pedir la misma nota dos veces devuelve la ya emitida', async () => {
    const { svc, r } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    const a = await svc.notaCredito(A, f.id, { motivo: 'x' }, actor);
    const b = await svc.notaCredito(A, f.id, { motivo: 'x' }, actor);
    expect(b).toMatchObject({ id: a.id, reutilizada: true });
    expect(r.facturas.filas.filter((x: any) => x.tipo === 'E')).toHaveLength(1);
  });

  it('exige motivo, factura timbrada y de ingreso', async () => {
    const { svc } = montar({ pac: new MockPacProvider({ fallarTimbrado: true }) });
    const incierta = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    await expect(svc.notaCredito(A, incierta.id, { motivo: 'x' }, actor)).rejects.toThrow(/timbrada y vigente/);
    const m = montar();
    const f = await m.svc.crearDesdeVenta(A, 'v-A', input, actor);
    await expect(m.svc.notaCredito(A, f.id, {}, actor)).rejects.toThrow(/motivo/);
    const nc = await m.svc.notaCredito(A, f.id, { motivo: 'x' }, actor);
    await expect(m.svc.notaCredito(A, nc.id, { motivo: 'x' }, actor)).rejects.toThrow(/factura de ingreso/);
  });
});

describe('Facturas F1 — cancelación', () => {
  it('motivo 02 se cancela al instante y libera la venta para volver a facturarla', async () => {
    const { svc, r } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    const c = await svc.cancelar(A, f.id, { motivo: '02' }, actor);
    expect(c.estado).toBe('CANCELADO');
    expect(r.enlaces.filas[0].activa).toBe(false);
    const nueva = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    expect(nueva).toMatchObject({ estado: 'TIMBRADO', reutilizada: false });
    expect(nueva.id).not.toBe(f.id);
  });

  it('motivo 01 exige UUID sustituto y queda CANCELACION_PENDIENTE (requiere aceptación)', async () => {
    const { svc } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    await expect(svc.cancelar(A, f.id, { motivo: '01' }, actor)).rejects.toThrow(/UUID/);
    const c = await svc.cancelar(A, f.id, { motivo: '01', uuidSustituto: 'x' }, actor);
    expect(c.estado).toBe('CANCELACION_PENDIENTE');
  });

  it('motivo inválido, ya cancelada o con nota de crédito vigente', async () => {
    const { svc } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    await expect(svc.cancelar(A, f.id, { motivo: '09' }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await svc.notaCredito(A, f.id, { motivo: 'x' }, actor);
    await expect(svc.cancelar(A, f.id, { motivo: '02' }, actor)).rejects.toThrow(/notas de crédito vigentes/);
    const m = montar();
    const g = await m.svc.crearDesdeVenta(A, 'v-A', input, actor);
    await m.svc.cancelar(A, g.id, { motivo: '02' }, actor);
    await expect(m.svc.cancelar(A, g.id, { motivo: '02' }, actor)).rejects.toThrow(/timbrada/);
  });

  it('si el proveedor no la conoce, 409 con mensaje claro', async () => {
    const { svc, r } = montar();
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    r.facturas.filas[0].uuid = '00000000-0000-4000-8000-000000000000';
    await expect(svc.cancelar(A, f.id, { motivo: '02' }, actor)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Facturas F1 — reportes', () => {
  it('facturado (ingresos − notas) contra cobrado, con estados y sin validez fiscal', async () => {
    const { svc } = montar();
    svc.cobrado = { ventas: 2, total: 324.8 };
    const f = await svc.crearDesdeVenta(A, 'v-A', input, actor);
    await svc.notaCredito(A, f.id, { partidas: [0], motivo: 'x' }, actor);
    const hoy = new Date().toISOString().slice(0, 10);
    const rep = await svc.reporte(A, hoy, hoy);
    expect(rep.sinValidezFiscal).toBe(true);
    expect(rep.facturado).toEqual({ ingresos: 162.4, notasDeCredito: 46.4, neto: 116 });
    expect(rep.cobrado).toEqual({ ventas: 2, total: 324.8 });
    expect(rep.sinFacturar.total).toBe(208.8);
    expect(rep.porEstado['I:TIMBRADO']).toEqual({ cantidad: 1, total: 162.4 });
    expect(rep.porEstado['E:TIMBRADO']).toEqual({ cantidad: 1, total: 46.4 });
  });

  it('un periodo inválido se rechaza y otro tenant ve ceros', async () => {
    const { svc } = montar();
    await svc.crearDesdeVenta(A, 'v-A', input, actor);
    await expect(svc.reporte(A, '2026-10-20', '2026-10-01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.reporte(A, 'hoy', 'mañana')).rejects.toBeInstanceOf(BadRequestException);
    const hoy = new Date().toISOString().slice(0, 10);
    const b = await svc.reporte(B, hoy, hoy);
    expect(b.facturado.neto).toBe(0);
    expect(b.porEstado).toEqual({});
  });
});

describe('Facturas F1 — controlador', () => {
  const rolesDe = (m: string) => Reflect.getMetadata(ROLES_KEY, (FacturasController.prototype as any)[m]);
  const rolesClase = Reflect.getMetadata(ROLES_KEY, FacturasController);

  it('facturas: ADMIN y GERENTE; CSD: solo ADMIN', () => {
    expect(rolesClase).toEqual(['ADMIN', 'GERENTE']);
    for (const m of ['csdEstado', 'csdCargar', 'csdDesactivar']) expect(rolesDe(m)).toEqual(['ADMIN']);
    for (const m of ['desdeVenta', 'listar', 'obtener', 'notaCredito', 'cancelar', 'reporte']) expect(rolesDe(m)).toBeUndefined();
  });

  it('sin tenant en la sesión (SOPORTE) → 403 en todo', () => {
    const svc: any = new Proxy({}, { get: () => jest.fn() });
    const c = new FacturasController(svc, svc);
    const req = { user: { roleCode: 'SOPORTE' } };
    expect(() => c.listar(req)).toThrow(/negocio/);
    expect(() => c.desdeVenta('v', {}, req)).toThrow(/negocio/);
    expect(() => c.csdEstado('co', req)).toThrow(/negocio/);
  });
});
