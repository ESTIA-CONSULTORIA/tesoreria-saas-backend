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
import * as bcrypt from 'bcrypt';
import { AutorizacionesService } from './autorizaciones.service';
import { AuditService } from '../audit/audit.service';
import { PosAutorizacion } from './entities/pos-autorizacion.entity';
import { User } from '../users/entities/user.entity';

// create() de una venta normal (la que nace PAGADA): del cliente solo se toma producto, cantidad y descuento por ítem.
// Precio de catálogo, subtotal, descuento en dinero, IVA y total se calculan en el servidor. SalesService REAL sobre una
// BD en memoria que respeta tenant, hace rollback de verdad y hace cumplir el folio único (23505).
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SUC = 'sucursal-A';

// Actores: sesión POS Lite (NIP) y sesión ERP.
const lite = (roleCode: string) => ({ id: `u-${roleCode}-lite`, email: `${roleCode.toLowerCase()}@lite`, roleCode, posLiteAccess: true });
const erp = (roleCode: string) => ({ id: `u-${roleCode}-erp`, email: `${roleCode.toLowerCase()}@erp`, roleCode, posLiteAccess: false });

describe('SalesService — cortesías y descuentos sobre el tope con autorización de un gerente (token de un solo uso)', () => {
  const CLAVE = 'clave-del-gerente-123';
  let autorizaciones: AutorizacionesService;
  let filasAut: any[];
  let usuarios: any[];
  let bitacora: any[];
  let ahora: number;
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
    'p-limon': { id: 'p-limon', type: 'SIMPLE', insumoId: null, recipeId: null, tenantId: TENANT_A, name: 'Orden de Limón', price: 10, esServicio: false, tasaIva: null },
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

    const coincide = (fila: any, where: any) =>
      Object.entries(where || {}).every(([k, v]: [string, any]) => {
        if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(fila[k]);
        if (v && typeof v === 'object' && v._type === 'isNull') return fila[k] === null || fila[k] === undefined;
        return fila[k] === v;
      });
    filasAut = [];
    bitacora = [];
    ahora = Date.parse('2026-10-05T14:00:00Z');
    const hashClave = await bcrypt.hash(CLAVE, 4);
    usuarios = [
      { id: 'g1', name: 'Gina Gerente', email: 'gerente@erp', roleCode: 'GERENTE', tenantId: TENANT_A, branchId: null, isActive: true, password: hashClave },
      { id: 'gB', name: 'Gerente B', email: 'gerente@b', roleCode: 'GERENTE', tenantId: TENANT_B, branchId: null, isActive: true, password: hashClave },
    ];
    const repoAut = {
      create: (d: any) => ({ ...d }),
      save: jest.fn((d: any) => { const f = { id: `aut-${filasAut.length + 1}`, ...d }; filasAut.push(f); return Promise.resolve(f); }),
      findOne: jest.fn(({ where }: any) => Promise.resolve(filasAut.find((f) => coincide(f, where)) ?? null)),
      update: jest.fn((where: any, patch: any) => { const f = filasAut.find((x) => coincide(x, where)); if (f) Object.assign(f, patch); return Promise.resolve({ affected: f ? 1 : 0 }); }),
    };
    const repoUsers = {
      find: jest.fn(({ where }: any) => Promise.resolve(usuarios.filter((u) => coincide(u, where)))),
      findOne: jest.fn(({ where }: any) => Promise.resolve(usuarios.find((u) => coincide(u, where)) ?? null)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        ShiftsService,
        AutorizacionesService,
        { provide: AuditService, useValue: { createLog: jest.fn((d: any) => { bitacora.push(d); return Promise.resolve(d); }) } },
        { provide: getRepositoryToken(PosAutorizacion), useValue: repoAut },
        { provide: getRepositoryToken(User), useValue: repoUsers },
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
    autorizaciones = module.get(AutorizacionesService);
    autorizaciones.now = () => ahora;
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

  // El cajero pide la autorización con las mismas líneas que luego manda en la venta; la contraseña es la del gerente.
  // Con tenantId, como el req.user real (lo trae el token).
  const cajero = { ...erp('CAJERO'), tenantId: TENANT_A };
  const autorizar = (items: any[], extra: Record<string, any> = {}, actor: any = cajero) =>
    autorizaciones.emitir({ autorizadorId: 'g1', contrasena: CLAVE, tipo: 'CORTESIA', motivo: 'cliente_vip', items, ...extra }, actor, { ip: '9.9.9.9' });
  const cortesia = (monto = TOTAL_2_TACOS) => [{ forma: 'CORTESIA', monto }];

  describe('cortesía de un cajero', () => {
    it('sin autorización: 403 y no queda venta ni inventario tocado', async () => {
      const err: any = await vender(cajero, [linea('p-simple', 2)], cortesia()).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toMatch(/Solo un gerente o administrador/);
      sinNada();
    });

    it('con el token de un gerente: la venta queda como cortesía, con el gerente como autorizador y el motivo del token', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items);
      // El motivo que mande el cajero en la forma de pago no manda: vale el de la autorización.
      const v = await vender(cajero, items, [{ forma: 'CORTESIA', monto: TOTAL_2_TACOS, motivo: 'otro', autorizadoPor: 'yo-mismo' }], { autorizacion: { token } });
      expect(venta(v.id).formasPago[0]).toMatchObject({ forma: 'CORTESIA', monto: 116, autorizadoPor: 'gerente@erp', motivo: 'cliente_vip', cobradoPorEmail: 'cajero@erp', cobradoPorRol: 'CAJERO' });
      expect(stock()).toBe(98);
    });

    it('queda en la bitácora POS_CORTESIA con venta, autorizador, quien cobra, motivo y monto, sin la contraseña ni el token', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items);
      const v = await vender(cajero, items, cortesia(), { autorizacion: { token } });
      const entrada = bitacora.find((b) => b.action === 'POS_CORTESIA');
      expect(entrada).toMatchObject({ entity: 'Sale', tenantId: TENANT_A, userEmail: 'cajero@erp', details: { ventaId: v.id, tipo: 'CORTESIA', motivo: 'cliente_vip', autorizadoPor: 'gerente@erp', cobradoPor: 'cajero@erp', via: 'TOKEN', monto: 116 } });
      const texto = JSON.stringify(bitacora);
      expect(texto).not.toContain(CLAVE);
      expect(texto).not.toContain(token);
      expect(texto).not.toMatch(/\$2[aby]\$/);
    });

    it('reusado: el mismo token no autoriza una segunda venta', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items);
      await vender(cajero, items, cortesia(), { autorizacion: { token } });
      const err: any = await vender(cajero, items, cortesia(), { autorizacion: { token } }).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toMatch(/ya se usó/);
      expect(ventas.size).toBe(1);
    });

    it('otro ticket: si se agrega un producto o cambia una cantidad después de autorizar, 403 y no queda nada', async () => {
      const { token } = await autorizar([linea('p-simple', 2)]);
      for (const items of [[linea('p-simple', 3)], [linea('p-simple', 2), linea('p-cocina-ins', 1)]]) {
        const err: any = await vender(cajero, items, cortesia(500), { autorizacion: { token } }).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toMatch(/no corresponde a este ticket/);
      }
      sinNada();
    });

    it('vencido: pasados 2 minutos, 403', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items);
      ahora += 2 * 60 * 1000 + 1;
      await expect(vender(cajero, items, cortesia(), { autorizacion: { token } })).rejects.toThrow(/venció/);
      sinNada();
    });

    it('otro tenant: un token de otro negocio no autoriza (403)', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items, { autorizadorId: 'gB' }, { ...cajero, tenantId: TENANT_B });
      await expect(vender(cajero, items, cortesia(), { autorizacion: { token } })).rejects.toBeInstanceOf(ForbiddenException);
      sinNada();
    });

    it('un token falso o de otro cajero no sirve', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items, {}, { ...erp('CAPITAN'), tenantId: TENANT_A });
      await expect(vender(cajero, items, cortesia(), { autorizacion: { token } })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(vender(cajero, items, cortesia(), { autorizacion: { token: 'inventado' } })).rejects.toBeInstanceOf(ForbiddenException);
      sinNada();
    });

    it('un token de DESCUENTO no autoriza una cortesía (403)', async () => {
      const items = [linea('p-simple', 2)];
      const { token } = await autorizar(items, { tipo: 'DESCUENTO', motivo: 'promocion' });
      await expect(vender(cajero, items, cortesia(), { autorizacion: { token } })).rejects.toThrow(/Solo un gerente o administrador/);
      sinNada();
    });
  });

  describe('cortesía de un gerente o administrador (sin segunda autorización)', () => {
    it.each(['GERENTE', 'ADMIN'])('%s: sin motivo, o con un motivo fuera de la lista, 400 y no queda nada', async (rol) => {
      for (const motivo of [undefined, '', 'porque-si']) {
        const err: any = await vender(erp(rol), [linea('p-simple', 2)], [{ forma: 'CORTESIA', monto: TOTAL_2_TACOS, ...(motivo === undefined ? {} : { motivo }) }]).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toMatch(/motivo/);
      }
      sinNada();
    });

    it.each(['GERENTE', 'ADMIN'])('%s: con motivo de la lista pasa y queda en bitácora (vía SESION, sin token)', async (rol) => {
      const v = await vender(erp(rol), [linea('p-simple', 2)], [{ forma: 'CORTESIA', monto: TOTAL_2_TACOS, motivo: 'cumpleanos' }]);
      expect(venta(v.id).formasPago[0]).toMatchObject({ motivo: 'cumpleanos', autorizadoPor: `${rol.toLowerCase()}@erp` });
      expect(bitacora.find((b) => b.action === 'POS_CORTESIA')).toMatchObject({ details: { motivo: 'cumpleanos', via: 'SESION', cobradoPor: `${rol.toLowerCase()}@erp` } });
    });
  });

  describe('descuento sobre el tope del rol (CAJERO 10 %)', () => {
    it('sin autorización: 403 (como siempre)', async () => {
      await expect(vender(cajero, [linea('p-simple', 2, 15)], efectivo(500))).rejects.toThrow(/hasta 10%/);
      sinNada();
    });

    it('con el token de DESCUENTO de un gerente pasa (15 %: neto 85, IVA 13.6, total 98.6) y queda en bitácora', async () => {
      const items = [linea('p-simple', 2, 15)];
      const { token } = await autorizar(items, { tipo: 'DESCUENTO', motivo: 'promocion' });
      const v = await vender(cajero, items, efectivo(98.6), { autorizacion: { token } });
      expect(venta(v.id)).toMatchObject({ subtotal: 100, descuento: 15, impuestos: 13.6, total: 98.6 });
      expect(bitacora.find((b) => b.action === 'POS_DESCUENTO_AUTORIZADO')).toMatchObject({ details: { motivo: 'promocion', autorizadoPor: 'gerente@erp', via: 'TOKEN' } });
    });

    it('un token de DESCUENTO no cubre el 100 % (eso es cortesía): 403', async () => {
      const items = [linea('p-simple', 2, 100)];
      const { token } = await autorizar(items, { tipo: 'DESCUENTO', motivo: 'promocion' });
      await expect(vender(cajero, items, cortesia(0), { autorizacion: { token } })).rejects.toBeInstanceOf(ForbiddenException);
      sinNada();
    });

    it('la autorización de 15 % no sirve para 20 %, ni se reutiliza', async () => {
      const { token } = await autorizar([linea('p-simple', 2, 15)], { tipo: 'DESCUENTO', motivo: 'promocion' });
      await expect(vender(cajero, [linea('p-simple', 2, 20)], efectivo(500), { autorizacion: { token } })).rejects.toThrow(/no corresponde/);
      await vender(cajero, [linea('p-simple', 2, 15)], efectivo(98.6), { autorizacion: { token } });
      await expect(vender(cajero, [linea('p-simple', 2, 15)], efectivo(98.6), { autorizacion: { token } })).rejects.toThrow(/ya se usó/);
      expect(ventas.size).toBe(1);
    });

    it('un token que no hace falta (descuento dentro del tope) no se gasta', async () => {
      const items = [linea('p-simple', 2, 5)];
      const { token } = await autorizar(items, { tipo: 'DESCUENTO', motivo: 'promocion' });
      await vender(cajero, items, efectivo(500), { autorizacion: { token } });
      expect(filasAut[0].usadoEn ?? null).toBeNull();
    });
  });

  describe('descuento sobre el tope en una cuenta abierta (PUT /pos/sales/:id/discount)', () => {
    async function cuenta(): Promise<string> {
      const c = await abrirCuenta({ ...erp('CAPITAN'), tenantId: TENANT_A });
      return c.id;
    }
    const descontar = (id: string, descuento: number, token?: string, actor: any = cajero) =>
      sales.applyDiscount(id, descuento, TOTAL_2_TACOS - descuento, TENANT_A, actor, token ? { token } : undefined, { ip: '9.9.9.9' });
    const pedirCuenta = (id: string, descuento: number, motivo = 'promocion') =>
      autorizaciones.emitir({ autorizadorId: 'g1', contrasena: CLAVE, tipo: 'DESCUENTO', motivo, ventaId: id, descuento }, cajero);

    it('sin autorización, 30 de 116 (26 %) sobre el 10 % del cajero: 403; con el token ligado a ESA cuenta y ESE descuento, pasa', async () => {
      const id = await cuenta();
      await expect(descontar(id, 30)).rejects.toThrow(/hasta 10%/);
      const { token } = await pedirCuenta(id, 30, 'cliente_frecuente');
      await descontar(id, 30, token);
      expect(venta(id)).toMatchObject({ total: 86 });
      expect(bitacora.find((b) => b.action === 'POS_DESCUENTO_AUTORIZADO')).toMatchObject({ details: { ventaId: id, motivo: 'cliente_frecuente', autorizadoPor: 'gerente@erp', monto: 30 } });
    });

    it('otro descuento, otra cuenta o reuso: 403 y la cuenta queda como estaba', async () => {
      const id = await cuenta();
      const { token } = await pedirCuenta(id, 30);
      await expect(descontar(id, 40, token)).rejects.toThrow(/no corresponde/);
      await expect(descontar('otra-cuenta', 30, token)).rejects.toBeDefined();
      expect(venta(id).total).toBe(TOTAL_2_TACOS);
      await descontar(id, 30, token);
      await expect(descontar(id, 30, token)).rejects.toBeDefined();
    });
  });
});
