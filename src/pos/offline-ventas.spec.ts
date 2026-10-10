import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { OfflineVentasService } from './offline-ventas.service';
import { AuditService } from '../audit/audit.service';
import { SalesController } from './sales.controller';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { Reflector } from '@nestjs/core';
import { ShiftsService } from './shifts.service';
import { Sale } from './entities/sale.entity';
import { Shift } from './entities/shift.entity';
import { Product } from './entities/product.entity';
import { Table } from './entities/table.entity';
import { NotaCocina } from './entities/nota-cocina.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { InventoryMovement } from '../costs/entities/inventory-movement.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from './insumo-alerts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';
import { PoliticaCobro, PoliticaDivision } from '../config/politicas-pos.config';

// create() de una venta normal (la que nace PAGADA): del cliente solo se toma producto, cantidad y descuento por ítem.
// Precio de catálogo, subtotal, descuento en dinero, IVA y total se calculan en el servidor. SalesService REAL sobre una
// BD en memoria que respeta tenant, hace rollback de verdad y hace cumplir el folio único (23505).
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SUC = 'sucursal-A';

// Actores: sesión POS Lite (NIP) y sesión ERP.
const lite = (roleCode: string) => ({ id: `u-${roleCode}-lite`, email: `${roleCode.toLowerCase()}@lite`, roleCode, posLiteAccess: true });
const erp = (roleCode: string) => ({ id: `u-${roleCode}-erp`, email: `${roleCode.toLowerCase()}@erp`, roleCode, posLiteAccess: false });

describe('Ventas offline fallidas — evaluar, registrar al precio vigente, descartar', () => {
  let sales: SalesService;
  let offline: OfflineVentasService;
  let audits: any[];
  let shiftsService: ShiftsService;
  let ventas: Map<string, any>;
  let turnos: Map<string, any>;
  let mesas: Map<string, any>;
  let insumos: Map<string, any>;
  let notas: any[];
  let mermas: any[];
  let movimientos: any[];
  let shiftUpdates: Array<{ id: string; patch: any }>;
  let caps: Record<string, boolean>;
  let politicaCobro: PoliticaCobro;
  let politicaDivision: PoliticaDivision;
  let nextId: number;
  let ivaCfg: { ivaTasaDefault: string; preciosIncluyenIva: boolean }; // IVA del negocio que devuelve el mock de settings
  let ivaCfgPorTenant: Record<string, { ivaTasaDefault: string; preciosIncluyenIva: boolean }>; // por tenant (gana sobre ivaCfg)

  const matches = (row: any, where: any) =>
    Object.entries(where || {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(row[k]);
      if (v && typeof v === 'object' && '_type' in v) return row[k] !== null && row[k] !== undefined;
      return row[k] === v;
    });
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const snapshot = () => ({
    ventas: new Map([...ventas].map(([k, v]) => [k, clone(v)])),
    mesas: new Map([...mesas].map(([k, v]) => [k, { ...v }])),
    insumos: new Map([...insumos].map(([k, v]) => [k, { ...v }])),
    notas: notas.map((n) => ({ ...n })),
    mermas: clone(mermas),
    movimientos: movimientos.map((m) => ({ ...m })),
  });
  const restore = (s: ReturnType<typeof snapshot>) => {
    ventas = s.ventas; mesas = s.mesas; insumos = s.insumos; notas = s.notas; mermas = s.mermas; movimientos = s.movimientos;
  };
  const mapFor = (entity: any): Map<string, any> | null =>
    entity === Sale ? ventas : entity === Shift ? turnos : entity === Table ? mesas : entity === Insumo ? insumos : null;

  const PRODUCTS: Record<string, any> = {
    'p-simple': { id: 'p-simple', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Taco', price: 50, esServicio: false },
    'p-servicio': { id: 'p-servicio', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Consulta', price: 100, esServicio: true },
    'p-B': { id: 'p-B', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_B, name: 'Ajeno', price: 10, esServicio: false },
    'p-cocina-ins': { id: 'p-cocina-ins', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Tacos al pastor', price: 60, esServicio: false, estacionPreparacion: 'COCINA' },
  };
  const productLookup = (where: any) => {
    const p = PRODUCTS[where.id];
    return Promise.resolve(p && (where.tenantId === undefined || p.tenantId === where.tenantId) ? { ...p } : null);
  };

  function buildManager() {
    return {
      create: jest.fn((entity: any, data: any) => ({ ...data, __entity: entity })),
      save: jest.fn((obj: any) => {
        const { __entity, ...rest } = obj;
        if (__entity === Sale) {
          if ([...ventas.values()].some((v) => v.folio === rest.folio)) throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
          const row = { id: `sale-${++nextId}`, createdAt: new Date(), ...rest };
          ventas.set(row.id, row);
          return Promise.resolve({ ...row });
        }
        if (__entity === NotaCocina) {
          const nota = { id: `nota-${++nextId}`, ...rest };
          notas.push(nota);
          return Promise.resolve({ ...nota });
        }
        if (__entity === InventoryMovement) movimientos.push(rest);
        return Promise.resolve(rest);
      }),
      findOne: jest.fn((entity: any, opts: any) => {
        if (entity === Product) return productLookup(opts.where);
        const m = mapFor(entity);
        if (!m) return Promise.resolve(null);
        const filas = [...m.values()].filter((r) => matches(r, opts.where));
        if (opts.order?.createdAt === 'DESC') filas.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        return Promise.resolve(filas[0] ? clone(filas[0]) : null);
      }),
      update: jest.fn((entity: any, criteria: any, patch: any) => {
        if (entity === NotaCocina) {
          for (const n of notas) if (matches(n, criteria)) Object.assign(n, patch);
          return Promise.resolve(undefined);
        }
        const m = mapFor(entity)!;
        for (const row of m.values()) {
          const hit = typeof criteria === 'string' ? row.id === criteria : matches(row, criteria);
          if (hit) Object.assign(row, patch);
        }
        return Promise.resolve(undefined);
      }),
    };
  }

  const turnoAbierto = (id: string, extra: Record<string, any> = {}) => ({
    id, tenantId: TENANT_A, sucursalId: SUC, cajero: `cajero-${id}`, status: 'ABIERTO', precorteGuardado: true,
    totalRetiros: 0, totalDepositos: 0, createdAt: new Date('2026-10-05T08:00:00Z'), ...extra,
  });

  // El servidor pone precio e IVA: 2 x $50 = $100 + 16% = $116 (sin importar lo que mande el cliente).
const TOTAL_2_TACOS = 116;
const ITEM_SIN_COCINA = { productoId: 'p-simple', nombre: 'Taco', cantidad: 2, precioUnitario: 50, descuento: 0, subtotal: 100 };
  const ITEM_COCINA = { productoId: 'p-cocina-ins', nombre: 'Tacos al pastor', cantidad: 1, precioUnitario: 60, descuento: 0, subtotal: 60 };

  // Abre una cuenta de mesa como `actor` (el controller siempre pasa req.user).
  async function abrirCuenta(actor: any, extra: Record<string, any> = {}, items: any[] = [ITEM_SIN_COCINA], tableId = 'mesa-1'): Promise<any> {
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    return sales.create({
      items, subtotal: total, descuento: 0, impuestos: 0, total,
      cajero: 'texto-del-cliente', sucursalId: SUC, tenantId: TENANT_A, tableId, folio: `VTA-${++nextId}`,
      ...extra,
    } as any, actor);
  }

  const venta = (id: string) => ventas.get(id);
  const stock = () => insumos.get('ins-1').stockActual;
  const mesa = (id = 'mesa-1') => mesas.get(id).status;

  // Las ventas encoladas llevan clientTimestamp fijo (2026-10-05): el servidor rechaza eventos de más de 48 h. Se fija solo
  // la fecha (el resto del reloj sigue real) para que el spec no caduque con el calendario.
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-10-05T14:00:00Z'),
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'hrtime', 'performance'],
    });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    caps = { mesas_cuenta_abierta: true };
    politicaCobro = 'SOLO_CAJA';
    politicaDivision = 'GERENTE_CAPITAN_CAJERO';
    nextId = 0;
    ivaCfg = { ivaTasaDefault: '16', preciosIncluyenIva: false };
    ivaCfgPorTenant = {};
    PRODUCTS['p-simple'].price = 50;
    ventas = new Map();
    turnos = new Map([['turno-1', turnoAbierto('turno-1')]]);
    mesas = new Map([
      ['mesa-1', { id: 'mesa-1', tenantId: TENANT_A, number: 1, status: 'AVAILABLE', isActive: true }],
      ['mesa-2', { id: 'mesa-2', tenantId: TENANT_A, number: 2, status: 'AVAILABLE', isActive: true }],
      ['mesa-3', { id: 'mesa-3', tenantId: TENANT_A, number: 3, status: 'AVAILABLE', isActive: true }],
    ]);
    insumos = new Map([['ins-1', { id: 'ins-1', nombre: 'Tortilla', isActive: true, stockActual: 100, stockMinimo: 0, costoUnitario: 5 }]]);
    notas = [];
    mermas = [];
    movimientos = [];
    shiftUpdates = [];

    const salesRepo = {
      findOne: jest.fn(({ where }: any) => {
        const row = [...ventas.values()].find((r) => matches(r, where));
        return Promise.resolve(row ? clone(row) : null);
      }),
      find: jest.fn(({ where }: any) => Promise.resolve([...ventas.values()].filter((r) => matches(r, where)).map(clone))),
      count: jest.fn(({ where }: any) => Promise.resolve([...ventas.values()].filter((r) => matches(r, where)).length)),
      update: jest.fn((id: string, patch: any) => { Object.assign(ventas.get(id), patch); return Promise.resolve(undefined); }),
      createQueryBuilder: jest.fn(),
    };
    const shiftsRepo = {
      findOne: jest.fn(({ where }: any) => {
        const row = [...turnos.values()].find((r) => matches(r, where));
        return Promise.resolve(row ? { ...row } : null);
      }),
      update: jest.fn((id: string, patch: any) => { shiftUpdates.push({ id, patch }); Object.assign(turnos.get(id), patch); return Promise.resolve(undefined); }),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const snap = snapshot();
        try {
          return await cb(buildManager());
        } catch (e) {
          restore(snap);
          throw e;
        }
      }),
      getRepository: jest.fn((entity: any) => ({
        findOne: ({ where }: any) => {
          const row = [...mapFor(entity)!.values()].find((r) => matches(r, where));
          return Promise.resolve(row ? { ...row } : null);
        },
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        ShiftsService,
        OfflineVentasService,
        { provide: AuditService, useValue: { createLog: jest.fn((l: any) => { audits.push(l); return Promise.resolve(l); }) } },
        { provide: CostsService, useValue: { createJustifiable: jest.fn((d: any) => { mermas.push(d); return Promise.resolve(d); }) } },
        { provide: AppointmentsService, useValue: {} },
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
        { provide: getRepositoryToken(Shift), useValue: shiftsRepo },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn(({ where }: any) => productLookup(where)) } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(({ where }: any) => Promise.resolve(insumos.get(where.id) ? { ...insumos.get(where.id) } : null)), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn(() => Promise.resolve(null)) } },
        { provide: DataSource, useValue: dataSource },
        { provide: InsumoAlertsService, useValue: { upsert: jest.fn() } },
        {
          provide: TenantSettingsService,
          useValue: {
            hasPosCapability: jest.fn((_t: string, cap: string) => Promise.resolve(!!caps[cap])),
            getIvaConfig: jest.fn((t: string) => Promise.resolve({ ...(ivaCfgPorTenant[t] ?? ivaCfg) })),
            getPoliticaCobro: jest.fn(() => Promise.resolve(politicaCobro)),
            getPoliticaDivisionCuentas: jest.fn(() => Promise.resolve(politicaDivision)),
            getPoliticaDevoluciones: jest.fn(() => Promise.resolve('SOLO_GERENTE')),
          },
        },
      ],
    }).compile();
    audits = [];
    sales = module.get(SalesService);
    offline = module.get(OfflineVentasService);
    shiftsService = module.get(ShiftsService);
  });

  // Lo que guardó el POS al encolar la venta sin conexión (POSPage): el payload que el motor reenvía a POST /pos/sales.
  const GERENTE = erp('GERENTE');
  const CTX = { ip: '10.0.0.1', userAgent: 'jest' };
  const encolada = (extra: Record<string, any> = {}) => ({
    items: [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 2, precioUnitario: 50, descuento: 0, subtotal: 100 }],
    subtotal: 100, descuento: 0, impuestos: 16, total: 116,
    formasPago: [{ forma: 'EFECTIVO', monto: 116 }],
    cajero: 'u-cajero-1', turnoId: 'turno-1', sucursalId: SUC, tenantId: TENANT_A,
    folio: 'VTA-20261005-DEV1-AB12', clientTimestamp: '2026-10-05T12:00:00.000Z', ...extra,
  });
  const sinVentas = () => { expect(ventas.size).toBe(0); expect(stock()).toBe(100); };

  describe('evaluar — qué pasaría hoy con esa venta', () => {
    it('precios sin cambio: el cobro cubre el total vigente', async () => {
      const e = await offline.evaluar(encolada(), TENANT_A);
      expect(e).toMatchObject({ valida: true, totalNuevo: 116, cobrado: 116, diferencia: 0, cubre: true, yaExiste: false });
    });

    it('el precio subió ($50 → $60): total nuevo, diferencia y el precio de cada ítem con el del cliente al lado', async () => {
      PRODUCTS['p-simple'].price = 60;
      const e = await offline.evaluar(encolada(), TENANT_A);
      expect(e).toMatchObject({ valida: true, totalNuevo: 139.2, cobrado: 116, diferencia: 23.2, cubre: false, totalCliente: 116 });
      expect(e.items[0]).toMatchObject({ productoId: 'p-simple', precioCliente: 50, precioVigente: 60, cantidad: 2 });
    });

    it('producto inexistente o de otro tenant: no es válida (motivo claro), sin lanzar y sin tocar nada', async () => {
      for (const productoId of ['no-existe', 'p-B']) {
        const e = await offline.evaluar(encolada({ items: [{ productoId, cantidad: 1, precioUnitario: 1, descuento: 0, subtotal: 1 }] }), TENANT_A);
        expect(e.valida).toBe(false);
        expect(e.motivo).toMatch(/Producto no encontrado/);
      }
      sinVentas();
    });

    it('marca si el folio ya está registrado en el servidor (solo en el tenant de quien consulta)', async () => {
      await sales.create(encolada() as any, GERENTE);
      expect((await offline.evaluar(encolada(), TENANT_A)).yaExiste).toBe(true);
      expect((await offline.evaluar(encolada(), TENANT_B)).yaExiste).toBe(false);
    });
  });

  describe('registrar al precio vigente', () => {
    it('el cobro cubre el total: queda con el folio y la hora originales, el total del SERVIDOR, quién lo resolvió y su registro', async () => {
      const r = await offline.registrar(encolada(), {}, TENANT_A, GERENTE, CTX);
      const v = venta(r.sale.id);
      expect(v).toMatchObject({ folio: 'VTA-20261005-DEV1-AB12', status: 'PAGADA', subtotal: 100, impuestos: 16, total: 116, tenantId: TENANT_A, turnoId: 'turno-1' });
      expect(new Date(v.fecha).toISOString()).toBe('2026-10-05T12:00:00.000Z');
      expect(v.notas).toMatch(/gerente@erp \(GERENTE\)/);
      expect(v.notas).toMatch(/Cajero original: u-cajero-1/);
      expect(v.formasPago[0]).toMatchObject({ forma: 'EFECTIVO', monto: 116, cobradoPorEmail: 'gerente@erp' });
      expect(stock()).toBe(98);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: 'OFFLINE_SALE_REGISTRADA', entity: 'Sale', userEmail: 'gerente@erp', roleCode: 'GERENTE', tenantId: TENANT_A, ipAddress: '10.0.0.1' });
      expect(audits[0].details).toMatchObject({ folio: 'VTA-20261005-DEV1-AB12', cobrado: 116, totalNuevo: 116, diferenciaAbsorbida: 0, saleId: r.sale.id });
    });

    it('el precio subió y el cobro NO cubre: 400 con el detalle, sin confirmación no se registra nada', async () => {
      PRODUCTS['p-simple'].price = 60;
      const err: any = await offline.registrar(encolada(), {}, TENANT_A, GERENTE, CTX).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'DIFERENCIA_SIN_CONFIRMAR', cobrado: 116, total: 139.2, diferencia: 23.2 });
      sinVentas();
      expect(audits).toHaveLength(0);
    });

    it('con la confirmación del gerente la diferencia se absorbe como CORTESIA autorizada por él; el total es el vigente', async () => {
      PRODUCTS['p-simple'].price = 60;
      const r = await offline.registrar(encolada(), { confirmarDiferencia: true }, TENANT_A, GERENTE, CTX);
      const v = venta(r.sale.id);
      expect(v.total).toBe(139.2);
      expect(v.formasPago.map((p: any) => [p.forma, p.monto])).toEqual([['EFECTIVO', 116], ['CORTESIA', 23.2]]);
      expect(v.formasPago[1]).toMatchObject({ autorizadoPor: 'gerente@erp' });
      expect(v.formasPago[1].motivo).toMatch(/cambio de precio/);
      expect(audits[0].details).toMatchObject({ cobrado: 116, totalNuevo: 139.2, diferenciaAbsorbida: 23.2 });
    });

    it('nunca toma el precio del cliente: un payload con precio y pago de $1 se registra por el total vigente (con la diferencia confirmada)', async () => {
      const trampa = encolada({ items: [{ productoId: 'p-simple', cantidad: 2, precioUnitario: 0.5, descuento: 0, subtotal: 1 }], total: 1.16, formasPago: [{ forma: 'EFECTIVO', monto: 1.16 }] });
      await expect(offline.registrar(trampa, {}, TENANT_A, GERENTE, CTX)).rejects.toBeInstanceOf(BadRequestException);
      const r = await offline.registrar(trampa, { confirmarDiferencia: true }, TENANT_A, GERENTE, CTX);
      expect(venta(r.sale.id)).toMatchObject({ total: 116, subtotal: 100 });
      expect(venta(r.sale.id).items[0].precioUnitario).toBe(50);
    });

    it('si el folio ya está registrado en el tenant no duplica: devuelve la existente', async () => {
      const primera = await sales.create(encolada() as any, GERENTE);
      const r = await offline.registrar(encolada(), {}, TENANT_A, GERENTE, CTX);
      expect(r.yaRegistrada).toBe(true);
      expect(r.sale.id).toBe(primera.id);
      expect(ventas.size).toBe(1);
      expect(stock()).toBe(98);
    });

    it('un folio que existe en OTRO tenant no se toca ni se revela: 400 genérico y la venta ajena queda igual', async () => {
      ventas.set('ajena', { id: 'ajena', folio: 'VTA-20261005-DEV1-AB12', tenantId: TENANT_B, status: 'PAGADA', total: 5, sucursalId: 'otra', cajero: 'x', fecha: new Date('2020-01-01') });
      const err: any = await offline.registrar(encolada(), {}, TENANT_A, GERENTE, CTX).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/ya existe/);
      expect(ventas.size).toBe(1);
      expect(ventas.get('ajena').total).toBe(5);
    });

    it('aislamiento: ignora el tenantId del payload; producto o turno de otro tenant no sirven', async () => {
      const r = await offline.registrar(encolada({ tenantId: TENANT_B }), {}, TENANT_A, GERENTE, CTX);
      expect(venta(r.sale.id).tenantId).toBe(TENANT_A);

      await expect(offline.registrar(encolada({ folio: 'F-2', items: [{ productoId: 'p-B', cantidad: 1, precioUnitario: 1, descuento: 0, subtotal: 1 }] }), { confirmarDiferencia: true }, TENANT_A, GERENTE, CTX)).rejects.toThrow(/Producto no encontrado/);

      turnos.get('turno-1').tenantId = TENANT_B; // el único turno es de otro tenant
      await expect(offline.registrar(encolada({ folio: 'F-3' }), {}, TENANT_A, GERENTE, CTX)).rejects.toThrow(/turno abierto/);
      expect(ventas.size).toBe(1);
    });

    it('turno original cerrado: se registra en el turno abierto de la sucursal y la nota lo dice; sin turno abierto, 400', async () => {
      turnos.get('turno-1').status = 'CERRADO';
      await expect(offline.registrar(encolada(), {}, TENANT_A, GERENTE, CTX)).rejects.toThrow(/turno abierto/);
      turnos.set('turno-2', { id: 'turno-2', tenantId: TENANT_A, sucursalId: SUC, cajero: 'otro', status: 'ABIERTO', precorteGuardado: false, totalRetiros: 0, totalDepositos: 0, createdAt: new Date() });
      const r = await offline.registrar(encolada(), {}, TENANT_A, GERENTE, CTX);
      expect(venta(r.sale.id).turnoId).toBe('turno-2');
      expect(venta(r.sale.id).notas).toMatch(/Turno original: turno-1/);
    });

    it('turno local sin sincronizar (local-...) se trata como inexistente: usa el turno abierto de la sucursal', async () => {
      const r = await offline.registrar(encolada({ turnoId: 'local-abc' }), {}, TENANT_A, GERENTE, CTX);
      expect(venta(r.sale.id).turnoId).toBe('turno-1');
    });

    it('sin formas de pago o con descuento fuera de rango: 400', async () => {
      await expect(offline.registrar(encolada({ formasPago: [] }), {}, TENANT_A, GERENTE, CTX)).rejects.toBeInstanceOf(BadRequestException);
      await expect(offline.registrar(encolada({ items: [{ productoId: 'p-simple', cantidad: 1, descuento: 150 }] }), {}, TENANT_A, GERENTE, CTX)).rejects.toBeInstanceOf(BadRequestException);
      sinVentas();
    });
  });

  describe('descartar con motivo obligatorio', () => {
    it('sin motivo (o demasiado corto): 400 y no queda registro', async () => {
      for (const motivo of [undefined, '', '   ', 'no']) {
        await expect(offline.descartar({ folio: 'VTA-X', motivo: motivo as any }, TENANT_A, GERENTE, CTX)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(audits).toHaveLength(0);
    });

    it('con motivo: queda registrado con quién, cuándo, qué folio y el resumen; no se crea ninguna venta', async () => {
      const r = await offline.descartar({ folio: 'VTA-X', motivo: 'Cliente no pagó, venta duplicada a mano', resumen: { total: 116, cobrado: 116 } }, TENANT_A, GERENTE, CTX);
      expect(r.ok).toBe(true);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ action: 'OFFLINE_SALE_DESCARTADA', userEmail: 'gerente@erp', roleCode: 'GERENTE', tenantId: TENANT_A });
      expect(audits[0].details).toMatchObject({ folio: 'VTA-X', motivo: 'Cliente no pagó, venta duplicada a mano', resumen: { total: 116, cobrado: 116 } });
      sinVentas();
    });

    it('si esa venta SÍ está en el servidor no se descarta (quedaría el dinero sin respaldo de la decisión)', async () => {
      await sales.create(encolada() as any, GERENTE);
      await expect(offline.descartar({ folio: 'VTA-20261005-DEV1-AB12', motivo: 'ya no la quiero' }, TENANT_A, GERENTE, CTX)).rejects.toThrow(/ya está registrada/);
      expect(audits).toHaveLength(0);
    });

    it('si falla el registro en auditoría, el descarte falla (no se acepta una resolución sin quién la hizo)', async () => {
      const m = (offline as any).audit.createLog as jest.Mock;
      m.mockRejectedValueOnce(new Error('bd caída'));
      await expect(offline.descartar({ folio: 'VTA-X', motivo: 'motivo suficiente' }, TENANT_A, GERENTE, CTX)).rejects.toThrow();
    });
  });

  describe('permisos de los endpoints: solo ADMIN y GERENTE', () => {
    const guard = new RolesGuard(new Reflector());
    const handlers = ['evaluarVentaOffline', 'registrarVentaOffline', 'descartarVentaOffline'] as const;
    const ctx = (handler: string, roleCode?: string) => ({
      getHandler: () => (SalesController.prototype as any)[handler],
      getClass: () => SalesController,
      switchToHttp: () => ({ getRequest: () => ({ user: roleCode ? { roleCode } : undefined }) }),
    }) as any;

    it.each(handlers)('%s declara @Roles(ADMIN, GERENTE)', (h) => {
      expect(Reflect.getMetadata(ROLES_KEY, (SalesController.prototype as any)[h])).toEqual(['ADMIN', 'GERENTE']);
    });

    it.each(handlers.flatMap((h) => ['CAJERO', 'MESERO', 'CAPITAN', 'CONTADOR', 'SOPORTE'].map((r) => [h, r] as const)))('%s: %s recibe 403', (h, rol) => {
      expect(() => guard.canActivate(ctx(h, rol))).toThrow(ForbiddenException);
    });

    it.each(handlers.flatMap((h) => ['ADMIN', 'GERENTE'].map((r) => [h, r] as const)))('%s: %s pasa', (h, rol) => {
      expect(guard.canActivate(ctx(h, rol))).toBe(true);
    });
  });

  describe('create: el 400 "ya existe" dice si es la MISMA venta (para que el motor offline la marque sincronizada)', () => {
    it('misma venta reenviada (mismo folio, sucursal, cajero y hora): mismoRegistro true', async () => {
      await sales.create(encolada() as any, GERENTE);
      const err: any = await sales.create(encolada() as any, GERENTE).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/ya existe/);
      expect(err.getResponse()).toMatchObject({ code: 'FOLIO_DUPLICADO', mismoRegistro: true });
      expect(ventas.size).toBe(1);
    });

    it('el reintento sigue siendo la misma aunque el precio haya cambiado entre el primer envío y el reintento', async () => {
      await sales.create(encolada() as any, GERENTE);
      PRODUCTS['p-simple'].price = 60;
      const err: any = await sales.create(encolada({ formasPago: [{ forma: 'EFECTIVO', monto: 200 }] }) as any, GERENTE).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'FOLIO_DUPLICADO', mismoRegistro: true });
    });

    it('respuesta perdida + el precio SUBIÓ antes del reintento: sigue siendo "ya existe" (no un "no cubren"), así el motor la da por sincronizada', async () => {
      await sales.create(encolada() as any, GERENTE); // el primer envío sí se registró a $116
      PRODUCTS['p-simple'].price = 60;               // el reintento, con el pago original de $116, ya no cubriría
      const err: any = await sales.create(encolada() as any, GERENTE).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'FOLIO_DUPLICADO', mismoRegistro: true });
      expect(err.message).toMatch(/ya existe/);
      expect(ventas.size).toBe(1);
      expect(stock()).toBe(98);
    });

    it('con la BD real `fecha` es una columna date (llega como texto YYYY-MM-DD, sin hora): se reconoce por fecha y hora', async () => {
      const primera = await sales.create(encolada() as any, GERENTE);
      const d = new Date('2026-10-05T12:00:00.000Z');
      const p = (n: number) => String(n).padStart(2, '0');
      ventas.get(primera.id).fecha = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const err: any = await sales.create(encolada() as any, GERENTE).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'FOLIO_DUPLICADO', mismoRegistro: true });
      const otra: any = await sales.create(encolada({ clientTimestamp: '2026-10-05T12:00:05.000Z' }) as any, GERENTE).catch((e) => e);
      expect(otra.getResponse()).toMatchObject({ mismoRegistro: false });
    });

    it('un folio igual de OTRA venta (otro cajero u otra hora) o de otro tenant: mismoRegistro false, no se confunde', async () => {
      await sales.create(encolada() as any, GERENTE);
      for (const extra of [{ cajero: 'otro-cajero' }, { clientTimestamp: '2026-10-05T13:00:00.000Z' }]) {
        const err: any = await sales.create(encolada(extra) as any, GERENTE).catch((e) => e);
        expect(err.getResponse()).toMatchObject({ code: 'FOLIO_DUPLICADO', mismoRegistro: false });
      }
      ventas.set('ajena', { id: 'ajena', folio: 'F-AJENO', tenantId: TENANT_B, status: 'PAGADA', total: 5, sucursalId: SUC, cajero: 'u-cajero-1', fecha: new Date('2026-10-05T12:00:00.000Z') });
      const err: any = await sales.create(encolada({ folio: 'F-AJENO' }) as any, GERENTE).catch((e) => e);
      expect(err.getResponse()).toMatchObject({ code: 'FOLIO_DUPLICADO', mismoRegistro: false });
    });
  });
});
