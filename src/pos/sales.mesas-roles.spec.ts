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

// Cuentas de mesa: estampado en el servidor (mesero y turno), reglas de rol de cobro / división / quitar /
// cancelar, quién cobró y corte Z por persona. SalesService y ShiftsService REALES sobre una BD en memoria que
// respeta tenant y hace rollback de verdad.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SUC = 'sucursal-A';

// Actores: sesión POS Lite (NIP) y sesión ERP.
const lite = (roleCode: string) => ({ id: `u-${roleCode}-lite`, email: `${roleCode.toLowerCase()}@lite`, roleCode, posLiteAccess: true });
const erp = (roleCode: string) => ({ id: `u-${roleCode}-erp`, email: `${roleCode.toLowerCase()}@erp`, roleCode, posLiteAccess: false });

describe('SalesService — cuentas de mesa: roles, estampado y corte', () => {
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
    'p-simple': { id: 'p-simple', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Taco', esServicio: false },
    'p-cocina-ins': { id: 'p-cocina-ins', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Tacos al pastor', esServicio: false, estacionPreparacion: 'COCINA' },
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

  beforeEach(async () => {
    caps = { mesas_cuenta_abierta: true };
    politicaCobro = 'SOLO_CAJA';
    politicaDivision = 'GERENTE_CAPITAN_CAJERO';
    nextId = 0;
    ventas = new Map();
    turnos = new Map([['turno-1', turnoAbierto('turno-1')]]);
    mesas = new Map([
      ['mesa-1', { id: 'mesa-1', tenantId: TENANT_A, number: 1, status: 'AVAILABLE', isActive: true }],
      ['mesa-2', { id: 'mesa-2', tenantId: TENANT_A, number: 2, status: 'AVAILABLE', isActive: true }],
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

  // ── abrir cuenta: mesero y turno estampados en el servidor ──────────────────────────────────────────────
  describe('abrir cuenta — estampado en el servidor', () => {
    it('el mesero de la cuenta sale del token, no del texto que manda el cliente', async () => {
      const c = await abrirCuenta(lite('MESERO'), { cajero: 'me-hago-pasar-por-otro' });
      expect(c.status).toBe('ABIERTA');
      expect(c.cajero).toBe('mesero@lite');
      expect(venta(c.id).cajero).toBe('mesero@lite');
      expect(mesa()).toBe('OCCUPIED');
    });

    it('la tableta POS Lite no tiene turno: la cuenta queda en el turno abierto de la sucursal (antes: sin turnoId)', async () => {
      const c = await abrirCuenta(lite('MESERO'), { turnoId: undefined });
      expect(c.turnoId).toBe('turno-1');
    });

    it('con varios turnos abiertos usa el más reciente; con turnoId válido usa ese', async () => {
      turnos.set('turno-2', turnoAbierto('turno-2', { createdAt: new Date('2026-10-05T12:00:00Z') }));
      const c1 = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], 'mesa-1');
      expect(c1.turnoId).toBe('turno-2');
      const c2 = await abrirCuenta(erp('CAJERO'), { turnoId: 'turno-1' }, [ITEM_SIN_COCINA], 'mesa-2');
      expect(c2.turnoId).toBe('turno-1');
    });

    it('sin turno abierto: 400 claro y no queda nada (ni mesa ocupada ni stock descontado)', async () => {
      turnos.get('turno-1').status = 'CERRADO';
      const err: any = await abrirCuenta(lite('MESERO')).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('No hay un turno abierto en esta sucursal: abre turno antes de abrir cuentas de mesa.');
      expect(ventas.size).toBe(0);
      expect(mesa()).toBe('AVAILABLE');
      expect(stock()).toBe(100);
    });

    it('turnoId de otro tenant, cerrado o de otra sucursal: 400 y no queda nada', async () => {
      turnos.set('turno-B', turnoAbierto('turno-B', { tenantId: TENANT_B }));
      turnos.set('turno-cerrado', turnoAbierto('turno-cerrado', { status: 'CERRADO' }));
      turnos.set('turno-otra-suc', turnoAbierto('turno-otra-suc', { sucursalId: 'sucursal-B' }));
      for (const turnoId of ['turno-B', 'turno-cerrado', 'turno-otra-suc', 'no-existe']) {
        await expect(abrirCuenta(erp('CAJERO'), { turnoId })).rejects.toThrow('El turno indicado no es un turno abierto de esta sucursal.');
      }
      expect(ventas.size).toBe(0);
      expect(mesa()).toBe('AVAILABLE');
      expect(stock()).toBe(100);
    });

    it('sin usuario (llamada interna) y con la capacidad apagada o una venta sin mesa: comportamiento de siempre', async () => {
      const interna = await abrirCuenta(undefined, { turnoId: 'turno-x' });
      expect(interna.cajero).toBe('texto-del-cliente');
      expect(interna.turnoId).toBe('turno-x');

      caps.mesas_cuenta_abierta = false;
      const apagada = await abrirCuenta(lite('MESERO'), { turnoId: 'turno-y' }, [ITEM_SIN_COCINA], 'mesa-2');
      expect(apagada.cajero).toBe('texto-del-cliente');
      expect(apagada.turnoId).toBe('turno-y');

      caps.mesas_cuenta_abierta = true;
      const sinMesa = await sales.create({ items: [ITEM_SIN_COCINA], subtotal: 100, descuento: 0, impuestos: 0, total: 100, cajero: 'caja-1', turnoId: 'turno-z', sucursalId: SUC, tenantId: TENANT_A, formasPago: [{ forma: 'EFECTIVO', monto: 100 }], folio: 'V-SIN-MESA' } as any, erp('CAJERO'));
      expect(sinMesa.cajero).toBe('caja-1');
      expect(sinMesa.turnoId).toBe('turno-z');
    });
  });
});
