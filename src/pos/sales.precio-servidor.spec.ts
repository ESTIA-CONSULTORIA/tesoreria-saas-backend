import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
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

describe('SalesService.create — POS normal: precio, descuento, IVA y total los pone el servidor', () => {
  let sales: SalesService;
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
    sales = module.get(SalesService);
    shiftsService = module.get(ShiftsService);
  });

  // ── helpers de venta normal ───────────────────────────────────────────────────────────────────────────────
  // Lo que manda el POS: producto, cantidad, descuento por ítem (porcentaje) y las formas de pago cobradas. El precio y
  // los importes que acompañan son los del cliente — justo lo que el servidor ya no debe creer.
  const linea = (productoId: string, cantidad: number, descuento = 0, precioCliente = 1) => ({
    productoId, nombre: 'del-cliente', cantidad, precioUnitario: precioCliente, descuento, subtotal: precioCliente * cantidad,
  });
  async function vender(actor: any, items: any[], pagos: any[], extra: Record<string, any> = {}): Promise<any> {
    return sales.create({
      items, subtotal: 1, descuento: 0, impuestos: 0, total: 1, formasPago: pagos,
      cajero: 'texto-del-cliente', turnoId: 'turno-1', sucursalId: SUC, tenantId: TENANT_A, folio: `VTA-${++nextId}`, ...extra,
    } as any, actor);
  }
  const efectivo = (monto: number) => [{ forma: 'EFECTIVO', monto }];
  const sinNada = () => { expect(ventas.size).toBe(0); expect(stock()).toBe(100); };

  describe('precio e importes los pone el servidor', () => {
    it('ignora precioUnitario, subtotal, impuestos y total del cliente: 2 x $50 + IVA 16% = $116', async () => {
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], efectivo(116), { subtotal: 1, impuestos: 0, total: 1 });
      expect(venta(v.id)).toMatchObject({ status: 'PAGADA', subtotal: 100, descuento: 0, impuestos: 16, total: 116 });
      expect(venta(v.id).items[0]).toMatchObject({ productoId: 'p-simple', precioUnitario: 50, subtotal: 100, nombre: 'Taco' });
      expect(stock()).toBe(98);
    });

    it('si el cliente manda un precio de menos, el pago que cobró no cubre el total real: 400 y no queda nada', async () => {
      const err: any = await vender(erp('CAJERO'), [linea('p-simple', 2)], efectivo(1.16)).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/no cubren el total/);
      sinNada();
    });

    it('un pago mayor al total (efectivo con cambio) se acepta, pero no infla el corte: el efectivo registrado es el total y el resto es cambio', async () => {
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], efectivo(200));
      expect(venta(v.id).total).toBe(116);
      expect(venta(v.id).formasPago[0]).toMatchObject({ forma: 'EFECTIVO', monto: 116, montoRecibido: 200, cambio: 84 });
    });

    it('pago mixto con exceso: se descuenta del efectivo; tarjeta de más sin efectivo que absorberlo es 400', async () => {
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], [{ forma: 'TARJETA', monto: 100 }, { forma: 'EFECTIVO', monto: 50 }]);
      expect(venta(v.id).formasPago.map((p: any) => [p.forma, p.monto])).toEqual([['TARJETA', 100], ['EFECTIVO', 16]]);
      await expect(vender(erp('CAJERO'), [linea('p-simple', 2)], [{ forma: 'TARJETA', monto: 200 }])).rejects.toThrow(/exceden el total/);
    });

    it('producto inexistente o de otro tenant: 400, sin venta ni inventario tocado', async () => {
      for (const productoId of ['no-existe', 'p-B']) {
        const err: any = await vender(erp('CAJERO'), [linea(productoId, 1)], efectivo(500)).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toMatch(/Producto no encontrado/);
      }
      sinNada();
    });

    it('cantidad inválida (cero, negativa, no numérica): 400', async () => {
      for (const cantidad of [0, -1, NaN]) {
        await expect(vender(erp('CAJERO'), [{ ...linea('p-simple', 1), cantidad }], efectivo(500))).rejects.toBeInstanceOf(BadRequestException);
      }
      sinNada();
    });

    it('venta sin ítems: 400', async () => {
      await expect(vender(erp('CAJERO'), [], efectivo(500))).rejects.toBeInstanceOf(BadRequestException);
      sinNada();
    });
  });

  describe('descuento por ítem: máximo y por rol (igual que PUT /discount)', () => {
    it('10% a un ítem: subtotal bruto, descuento en dinero, IVA sobre el neto', async () => {
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2, 10)], efectivo(104.4));
      // bruto 100, descuento 10, neto 90, IVA 14.40, total 104.40
      expect(venta(v.id)).toMatchObject({ subtotal: 100, descuento: 10, impuestos: 14.4, total: 104.4 });
      expect(venta(v.id).items[0]).toMatchObject({ descuento: 10, subtotal: 90 });
    });

    it.each(['ADMIN', 'GERENTE', 'CAPITAN', 'CAJERO'])('%s puede dar descuento (10%, dentro del tope de todos)', async (rol) => {
      politicaCobro = 'GERENTE_EN_MESA'; // el capitán solo cobra en mesa con esta política; el descuento es lo que se prueba
      const v = await vender(erp(rol), [linea('p-simple', 2, 10)], efectivo(104.4));
      expect(venta(v.id)).toMatchObject({ descuento: 10, total: 104.4 });
    });

    // Topes por rol (servidor): CAJERO 10%, CAPITAN 20%, GERENTE y ADMIN sin tope. Venta de 2 × $50 = $100 bruto.
    describe('tope de descuento por rol', () => {
      beforeEach(() => { politicaCobro = 'GERENTE_EN_MESA'; });

      it('CAJERO: 10% pasa (neto 90, IVA 14.40, total 104.40); 10.01% da 403 con mensaje claro y no deja nada', async () => {
        const ok = await vender(erp('CAJERO'), [linea('p-simple', 2, 10)], efectivo(104.4));
        expect(venta(ok.id)).toMatchObject({ subtotal: 100, descuento: 10, impuestos: 14.4, total: 104.4 });
        const antes = ventas.size;
        const err: any = await vender(erp('CAJERO'), [linea('p-simple', 2, 10.01)], efectivo(104.4)).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toBe('Tu rol (CAJERO) puede dar hasta 10% de descuento y pediste 10.01%. Pide a un capitán o gerente.');
        expect(ventas.size).toBe(antes);
      });

      it('CAPITAN: 20% pasa (neto 80, IVA 12.80, total 92.80); 20.5% da 403', async () => {
        const ok = await vender(erp('CAPITAN'), [linea('p-simple', 2, 20)], efectivo(92.8));
        expect(venta(ok.id)).toMatchObject({ subtotal: 100, descuento: 20, impuestos: 12.8, total: 92.8 });
        const err: any = await vender(erp('CAPITAN'), [linea('p-simple', 2, 20.5)], efectivo(92.8)).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toContain('hasta 20%');
        expect(err.message).toContain('Pide a un gerente o administrador');
      });

      it.each(['GERENTE', 'ADMIN'])('%s: 50% pasa (neto 50, IVA 8, total 58) y 100% también', async (rol) => {
        const v = await vender(erp(rol), [linea('p-simple', 2, 50)], efectivo(58));
        expect(venta(v.id)).toMatchObject({ subtotal: 100, descuento: 50, impuestos: 8, total: 58 });
        const c = await vender(erp(rol), [linea('p-simple', 2, 100)], [{ forma: 'CORTESIA', monto: 0, motivo: 'cortesia_ejecutiva', autorizadoPor: 'dueño' }]);
        expect(venta(c.id)).toMatchObject({ descuento: 100, total: 0 });
      });
    });

    it('el mesero (ERP o POS Lite) y roles sin permiso reciben 403 si piden descuento', async () => {
      for (const actor of [lite('MESERO'), erp('MESERO'), erp('CONTADOR'), {}]) {
        const err: any = await vender(actor, [linea('p-simple', 2, 10)], efectivo(500)).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
      }
      sinNada();
    });

    it('descuento fuera de rango (negativo, mayor a 100, no numérico): 400', async () => {
      for (const descuento of [-1, 100.01, 150, NaN]) {
        await expect(vender(erp('GERENTE'), [linea('p-simple', 2, descuento)], efectivo(500))).rejects.toBeInstanceOf(BadRequestException);
      }
      sinNada();
    });

    it('cortesía (100%): total $0 y se registra con la forma CORTESIA', async () => {
      const v = await vender(erp('GERENTE'), [linea('p-simple', 2, 100)], [{ forma: 'CORTESIA', monto: 0, motivo: 'cortesia_ejecutiva', autorizadoPor: 'dueño' }]);
      expect(venta(v.id)).toMatchObject({ subtotal: 100, descuento: 100, impuestos: 0, total: 0 });
    });
  });

  describe('formas de pago: atribución desde el token', () => {
    it('cobradoPor*, origen y dividido que mande el cliente se descartan; se estampa el usuario del token', async () => {
      const pagos = [{ forma: 'EFECTIVO', monto: 116, cobradoPorEmail: 'otro@x', cobradoPorId: 'otro', cobradoPorRol: 'ADMIN', origen: 'MESA', dividido: true, divididoPorEmail: 'otro@x', itemIndexes: [0] }];
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], pagos);
      const p = venta(v.id).formasPago[0];
      expect(p).toMatchObject({ forma: 'EFECTIVO', monto: 116, cobradoPorEmail: 'cajero@erp', cobradoPorRol: 'CAJERO', origen: 'CAJA' });
      expect(p.dividido).toBeUndefined();
      expect(p.divididoPorEmail).toBeUndefined();
      expect(p.itemIndexes).toBeUndefined();
    });

    it('el mesero y el capitán no cobran una venta directa: misma política de cobro (SOLO_CAJA → 403); con MESERO_EN_MESA sí', async () => {
      for (const actor of [lite('MESERO'), erp('MESERO'), lite('CAPITAN')]) {
        await expect(vender(actor, [linea('p-simple', 2)], efectivo(116))).rejects.toBeInstanceOf(ForbiddenException);
      }
      sinNada();
      politicaCobro = 'MESERO_EN_MESA';
      const v = await vender(lite('MESERO'), [linea('p-simple', 2)], efectivo(116));
      expect(venta(v.id).formasPago[0]).toMatchObject({ origen: 'MESA', cobradoPorEmail: 'mesero@lite' });
    });

    it('un cajero con sesión POS Lite (Corte Caja Lite) sigue vendiendo con el default SOLO_CAJA', async () => {
      const v = await vender(lite('CAJERO'), [linea('p-simple', 2)], efectivo(116));
      expect(venta(v.id).status).toBe('PAGADA');
    });
  });

  describe('venta de servicios, ligadas a mesa y a cita', () => {
    it('servicio con la capacidad venta_de_servicio: precio de catálogo, sin descuento de inventario', async () => {
      caps.venta_de_servicio = true;
      const v = await vender(erp('CAJERO'), [linea('p-servicio', 1)], efectivo(116));
      expect(venta(v.id)).toMatchObject({ subtotal: 100, impuestos: 16, total: 116 });
      expect(stock()).toBe(100);
      expect(venta(v.id).costoReal).toBe(0);
    });

    it('venta pagada ligada a una mesa (POS de restaurante): se calcula en el servidor y no abre cuenta ni ocupa la mesa', async () => {
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], efectivo(116), { tableId: 'mesa-1' });
      expect(venta(v.id)).toMatchObject({ status: 'PAGADA', total: 116, tableId: 'mesa-1' });
      expect(mesa()).toBe('AVAILABLE');
    });

    it('cuenta abierta de mesa (sin pagos): sigue con precio e IVA del servidor', async () => {
      const c = await abrirCuenta(lite('MESERO'), { total: 1 }, [linea('p-simple', 2)]);
      expect(venta(c.id)).toMatchObject({ status: 'ABIERTA', subtotal: 100, impuestos: 16, total: 116 });
    });
  });

  describe('cola offline: se recalcula al sincronizar, sin duplicar y sin cambiar de monto', () => {
    // Lo que encola el POS sin conexión (POSPage): el mismo payload con folio y clientTimestamp generados en el cliente,
    // con los precios del catálogo en caché. El motor de sincronización lo reenvía tal cual a POST /pos/sales.
    const encolada = (extra: Record<string, any> = {}) => ({
      items: [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 2, precioUnitario: 50, descuento: 0, subtotal: 100 }],
      subtotal: 100, descuento: 0, impuestos: 16, total: 116, formasPago: efectivo(116),
      cajero: 'cajero-1', turnoId: 'turno-1', sucursalId: SUC, tenantId: TENANT_A,
      folio: 'OFF-DEV1-0001', clientTimestamp: '2026-10-05T12:00:00.000Z', ...extra,
    });

    it('con los precios sin cambios queda exactamente el monto que cobró el cajero offline, con su folio y su hora', async () => {
      const v = await sales.create(encolada() as any, erp('CAJERO'));
      expect(venta(v.id)).toMatchObject({ folio: 'OFF-DEV1-0001', subtotal: 100, impuestos: 16, total: 116, status: 'PAGADA' });
      expect(venta(v.id).formasPago[0].monto).toBe(116);
      expect(new Date(venta(v.id).fecha).toISOString()).toBe('2026-10-05T12:00:00.000Z');
    });

    it('reenviarla (respuesta perdida, reintento) no duplica: 400 por folio y queda UNA venta con el inventario descontado una vez', async () => {
      await sales.create(encolada() as any, erp('CAJERO'));
      const err: any = await sales.create(encolada() as any, erp('CAJERO')).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/ya existe/);
      expect(ventas.size).toBe(1);
      expect(stock()).toBe(98);
    });

    it('una venta offline manipulada (precio y pago de $1.16) se rechaza al sincronizar: el servidor recalcula', async () => {
      const trampa = encolada({ items: [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 2, precioUnitario: 0.5, descuento: 0, subtotal: 1 }], subtotal: 1, impuestos: 0.16, total: 1.16, formasPago: efectivo(1.16) });
      await expect(sales.create(trampa as any, erp('CAJERO'))).rejects.toThrow(/no cubren el total/);
      sinNada();
    });

    it('si el precio SUBIÓ mientras estaba sin conexión, el pago cobrado ya no cubre el total: se rechaza (nunca se acepta el precio del cliente)', async () => {
      PRODUCTS['p-simple'].price = 60;
      await expect(sales.create(encolada() as any, erp('CAJERO'))).rejects.toThrow(/no cubren el total/);
      sinNada();
    });
  });

  // ── IVA configurable: por negocio, por producto, incluido o no ───────────────────────────────────────────
  // Productos de prueba: p-simple $50 (sin tasa propia), p-iva8 $100 (8 %), p-iva0 $100 (0 %), p-exento $100 (exento).
  describe('IVA configurable', () => {
    beforeEach(() => {
      PRODUCTS['p-simple'].price = 50; // un test anterior (precio que subió offline) lo deja en 60
      Object.assign(PRODUCTS, {
        'p-iva8': { id: 'p-iva8', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Al 8%', price: 100, esServicio: false, tasaIva: '8' },
        'p-iva0': { id: 'p-iva0', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Al 0%', price: 100, esServicio: false, tasaIva: '0' },
        'p-exento': { id: 'p-exento', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Exento', price: 100, esServicio: false, tasaIva: 'EXENTO' },
      });
    });
    afterEach(() => { for (const k of ['p-iva8', 'p-iva0', 'p-exento']) delete PRODUCTS[k]; });

    const cobrarTodo = (total: number) => [{ forma: 'EFECTIVO', monto: total }];

    describe('tasa por defecto del negocio (precios SIN IVA: el servidor lo suma)', () => {
      it('compatibilidad: un negocio sin configuración queda en 16 % — 2 × $50 → subtotal 100, IVA 16, total 116', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(116));
        expect(venta(v.id)).toMatchObject({ subtotal: 100, descuento: 0, impuestos: 16, total: 116 });
        expect(venta(v.id).items[0]).toMatchObject({ tasaIva: '16', ivaIncluido: false, subtotal: 100 });
      });

      it.each([
        ['8', 8, 108],
        ['0', 0, 100],
        ['EXENTO', 0, 100],
      ])('tasa %s: 2 × $50 → IVA %s, total %s', async (tasa, iva, total) => {
        ivaCfg = { ivaTasaDefault: tasa, preciosIncluyenIva: false };
        const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(total));
        expect(venta(v.id)).toMatchObject({ subtotal: 100, descuento: 0, impuestos: iva, total });
        expect(venta(v.id).items[0]).toMatchObject({ tasaIva: tasa, ivaIncluido: false });
      });

      it('el pago que no cubre el total con la tasa del negocio se rechaza: con 8 % el total es 108, no 116', async () => {
        ivaCfg = { ivaTasaDefault: '8', preciosIncluyenIva: false };
        await expect(vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(100))).rejects.toThrow(/no cubren el total/);
        sinNada();
      });
    });

    describe('tasa propia del producto (reemplaza la del negocio)', () => {
      it('p-iva8 con el negocio al 16 %: 1 × $100 → IVA 8, total 108', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-iva8', 1)], cobrarTodo(108));
        expect(venta(v.id)).toMatchObject({ subtotal: 100, impuestos: 8, total: 108 });
        expect(venta(v.id).items[0].tasaIva).toBe('8');
      });

      it('p-iva0 y p-exento: sin IVA y cada uno conserva su tasa para el desglose', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-iva0', 1), linea('p-exento', 1)], cobrarTodo(200));
        expect(venta(v.id)).toMatchObject({ subtotal: 200, impuestos: 0, total: 200 });
        expect(venta(v.id).items.map((i: any) => i.tasaIva)).toEqual(['0', 'EXENTO']);
      });

      it('la tasa que mande el cliente en la línea se descarta: la del producto o la del negocio', async () => {
        const v = await vender(erp('CAJERO'), [{ ...linea('p-simple', 2), tasaIva: '0', ivaIncluido: true }], cobrarTodo(116));
        expect(venta(v.id).items[0]).toMatchObject({ tasaIva: '16', ivaIncluido: false });
        expect(venta(v.id).impuestos).toBe(16);
      });
    });

    describe('mezcla de productos con distinta tasa', () => {
      it('16 % + 8 % + exento: subtotal 300, IVA 16 + 8 + 0 = 24, total 324', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-simple', 2), linea('p-iva8', 1), linea('p-exento', 1)], cobrarTodo(324));
        expect(venta(v.id)).toMatchObject({ subtotal: 300, descuento: 0, impuestos: 24, total: 324 });
      });

      it('con descuento del 10 % en dos líneas: neto 90 + 90 + 100, IVA 14.40 + 7.20 + 0 = 21.60, total 301.60', async () => {
        const v = await vender(erp('GERENTE'), [linea('p-simple', 2, 10), linea('p-iva8', 1, 10), linea('p-exento', 1)], cobrarTodo(301.6));
        expect(venta(v.id)).toMatchObject({ subtotal: 300, descuento: 20, impuestos: 21.6, total: 301.6 });
        expect(venta(v.id).items.map((i: any) => [i.tasaIva, i.subtotal])).toEqual([['16', 90], ['8', 90], ['EXENTO', 100]]);
      });
    });

    describe('precios que INCLUYEN IVA: el servidor lo desglosa', () => {
      beforeEach(() => { ivaCfg = { ivaTasaDefault: '16', preciosIncluyenIva: true }; });

      it('2 × $50 con IVA incluido al 16 %: el cliente paga 100; base 86.21 + IVA 13.79', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(100));
        expect(venta(v.id)).toMatchObject({ subtotal: 86.21, descuento: 0, impuestos: 13.79, total: 100 });
        expect(venta(v.id).items[0]).toMatchObject({ precioUnitario: 50, subtotal: 86.21, tasaIva: '16', ivaIncluido: true });
      });

      it('el total no cambia con el IVA: pagar 116 por lo que vale 100 es cambio, no un cobro de más', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(116));
        expect(venta(v.id).total).toBe(100);
        expect(venta(v.id).formasPago[0]).toMatchObject({ monto: 100, montoRecibido: 116, cambio: 16 });
      });

      it('mezcla con IVA incluido: 100 al 16 % + 100 al 8 % + 100 exento → base 278.80, IVA 13.79 + 7.41 + 0, total 300', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-simple', 2), linea('p-iva8', 1), linea('p-exento', 1)], cobrarTodo(300));
        expect(venta(v.id)).toMatchObject({ subtotal: 278.8, impuestos: 21.2, total: 300 });
      });

      it('con descuento del 10 %: 100 → 90 con IVA incluido; base 77.59 + IVA 12.41 = 90; descuento en base 8.62', async () => {
        const v = await vender(erp('GERENTE'), [linea('p-simple', 2, 10)], cobrarTodo(90));
        expect(venta(v.id)).toMatchObject({ subtotal: 86.21, descuento: 8.62, impuestos: 12.41, total: 90 });
        // subtotal − descuento + impuestos = total
        expect(86.21 - 8.62 + 12.41).toBeCloseTo(90, 2);
      });

      it('p-iva0 con IVA incluido no desglosa nada: 100 → base 100, IVA 0', async () => {
        const v = await vender(erp('CAJERO'), [linea('p-iva0', 1)], cobrarTodo(100));
        expect(venta(v.id)).toMatchObject({ subtotal: 100, impuestos: 0, total: 100 });
      });
    });

    it('la tasa de una venta queda guardada: cambiar la configuración después no la modifica', async () => {
      const v = await vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(116));
      ivaCfg = { ivaTasaDefault: '8', preciosIncluyenIva: true };
      expect(venta(v.id)).toMatchObject({ impuestos: 16, total: 116 });
      expect(venta(v.id).items[0]).toMatchObject({ tasaIva: '16', ivaIncluido: false });
    });

    it('aislamiento de tenant: la configuración de IVA de un negocio no afecta a otro', async () => {
      ivaCfgPorTenant[TENANT_A] = { ivaTasaDefault: '8', preciosIncluyenIva: false };
      ivaCfgPorTenant[TENANT_B] = { ivaTasaDefault: '0', preciosIncluyenIva: false };
      turnos.set('turno-B', turnoAbierto('turno-B', { tenantId: TENANT_B }));
      const a = await vender(erp('CAJERO'), [linea('p-simple', 2)], cobrarTodo(108));
      expect(venta(a.id)).toMatchObject({ impuestos: 8, total: 108 });
      const b = await vender(erp('CAJERO'), [linea('p-B', 1)], cobrarTodo(10), { tenantId: TENANT_B, turnoId: 'turno-B' });
      expect(venta(b.id)).toMatchObject({ tenantId: TENANT_B, impuestos: 0, total: 10 });
      expect(venta(b.id).items[0].tasaIva).toBe('0');
    });
  });

});
