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
    'p-simple': { id: 'p-simple', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Taco', price: 50, esServicio: false },
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
      const sinMesa = await sales.create({ items: [ITEM_SIN_COCINA], subtotal: 100, descuento: 0, impuestos: 16, total: 116, cajero: 'caja-1', turnoId: 'turno-z', sucursalId: SUC, tenantId: TENANT_A, formasPago: [{ forma: 'EFECTIVO', monto: 116 }], folio: 'V-SIN-MESA' } as any, erp('CAJERO'));
      expect(sinMesa.cajero).toBe('caja-1');
      expect(sinMesa.turnoId).toBe('turno-z');
    });
  });

  // ── cobro completo ───────────────────────────────────────────────────────────────────────────────────────
  const cobrar = (id: string, data: any, actor: any, tenant = TENANT_A) => sales.cobrarCuenta(id, data, tenant, actor);
  const COMPLETO = { formaPago: 'EFECTIVO' };
  const POLITICAS_COBRO_ALL: PoliticaCobro[] = ['SOLO_CAJA', 'GERENTE_EN_MESA', 'MESERO_EN_MESA'];

  describe('cobro completo — desde caja nunca se bloquea', () => {
    it.each(POLITICAS_COBRO_ALL.flatMap((p) => ['ADMIN', 'GERENTE', 'CAJERO'].map((r) => [p, r] as const)))(
      'con %s, %s con sesión ERP cobra la cuenta completa (origen CAJA)', async (politica, rol) => {
        politicaCobro = politica;
        const c = await abrirCuenta(lite('MESERO'));
        const r = await cobrar(c.id, COMPLETO, erp(rol));
        expect(r.cerrada).toBe(true);
        expect(venta(c.id).status).toBe('PAGADA');
        expect(mesa()).toBe('AVAILABLE');
        const pago = venta(c.id).formasPago[0];
        expect(pago).toMatchObject({ forma: 'EFECTIVO', monto: TOTAL_2_TACOS, origen: 'CAJA', cobradoPorEmail: `${rol.toLowerCase()}@erp`, cobradoPorRol: rol });
        expect(pago.dividido).toBeUndefined();
      });

    it('un gerente con sesión ERP cuenta como caja aunque esté en una tableta: cobra con SOLO_CAJA', async () => {
      const c = await abrirCuenta(erp('GERENTE'));
      await cobrar(c.id, COMPLETO, erp('GERENTE'));
      expect(venta(c.id).formasPago[0].origen).toBe('CAJA');
    });

    it('el mismo gerente con sesión POS Lite (NIP) es mesa: con SOLO_CAJA se rechaza', async () => {
      const c = await abrirCuenta(lite('GERENTE'));
      await expect(cobrar(c.id, COMPLETO, lite('GERENTE'))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cobro completo — desde mesa, según politicaCobro', () => {
    it('defaults (SOLO_CAJA y GERENTE_CAPITAN_CAJERO): el mesero con NIP recibe 403 y la cuenta queda intacta', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      const err: any = await cobrar(c.id, COMPLETO, lite('MESERO')).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toBe('Con la política de cobro de este negocio las cuentas solo se cobran en caja. Pasa la cuenta a caja.');
      expect(venta(c.id).status).toBe('ABIERTA');
      expect(venta(c.id).formasPago ?? []).toHaveLength(0);
      expect(mesa()).toBe('OCCUPIED');
    });

    it('SOLO_CAJA: mesero (POS Lite o ERP) y capitán son rechazados con 403', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      for (const actor of [lite('MESERO'), erp('MESERO'), lite('CAPITAN'), erp('CAPITAN')]) {
        await expect(cobrar(c.id, COMPLETO, actor)).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(venta(c.id).status).toBe('ABIERTA');
    });

    it('GERENTE_EN_MESA: capitán y gerente con NIP cobran (origen MESA); el mesero sigue en 403', async () => {
      politicaCobro = 'GERENTE_EN_MESA';
      const c1 = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], 'mesa-1');
      await expect(cobrar(c1.id, COMPLETO, lite('MESERO'))).rejects.toThrow('Tu rol no puede cobrar cuentas desde mesa');
      await cobrar(c1.id, COMPLETO, lite('CAPITAN'));
      expect(venta(c1.id).formasPago[0]).toMatchObject({ origen: 'MESA', cobradoPorRol: 'CAPITAN' });
      const c2 = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], 'mesa-2');
      await cobrar(c2.id, COMPLETO, lite('GERENTE'));
      expect(venta(c2.id).formasPago[0]).toMatchObject({ origen: 'MESA', cobradoPorRol: 'GERENTE' });
    });

    it('MESERO_EN_MESA: el mesero cobra la cuenta completa desde mesa y queda estampado', async () => {
      politicaCobro = 'MESERO_EN_MESA';
      const c = await abrirCuenta(lite('MESERO'));
      await cobrar(c.id, { formaPago: 'EFECTIVO', montoRecibido: 200, cambio: 84 }, lite('MESERO'));
      expect(venta(c.id).formasPago[0]).toMatchObject({ monto: TOTAL_2_TACOS, origen: 'MESA', cobradoPorId: 'u-MESERO-lite', cobradoPorEmail: 'mesero@lite', montoRecibido: 200, cambio: 84 });
    });

    it('PUT /pay (cobro de un solo pago) respeta la misma política: mesero 403 con SOLO_CAJA; cajero ERP cobra y queda estampado', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      const pay = (actor: any) => sales.pay(c.id, { formaPago: 'EFECTIVO', montoRecibido: 120, cambio: 4 }, TENANT_A, actor);
      await expect(pay(lite('MESERO'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(venta(c.id).status).toBe('ABIERTA');
      await pay(erp('CAJERO'));
      expect(venta(c.id).status).toBe('PAGADA');
      expect(venta(c.id).formasPago[0]).toMatchObject({ forma: 'EFECTIVO', monto: TOTAL_2_TACOS, origen: 'CAJA', cobradoPorEmail: 'cajero@erp' });
      expect(mesa()).toBe('AVAILABLE');
    });
  });

  // ── dividir ──────────────────────────────────────────────────────────────────────────────────────────────
  describe('cobro dividido — politicaDivisionCuentas', () => {
    const parcial = { formaPago: 'EFECTIVO', monto: 40 };

    it('default GERENTE_CAPITAN_CAJERO: cajero, gerente y ADMIN en caja dividen; queda marcado quién dividió', async () => {
      for (const rol of ['CAJERO', 'GERENTE', 'ADMIN']) {
        const c = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], rol === 'CAJERO' ? 'mesa-1' : rol === 'GERENTE' ? 'mesa-2' : 'mesa-3');
        await cobrar(c.id, parcial, erp(rol));
        expect(venta(c.id).status).toBe('ABIERTA');
        expect(venta(c.id).formasPago[0]).toMatchObject({ monto: 40, dividido: true, divididoPorEmail: `${rol.toLowerCase()}@erp` });
      }
    });

    it('SOLO_GERENTE: el cajero recibe 403 al dividir (parcial, por ítems, y el último pago de una cuenta ya dividida)', async () => {
      politicaDivision = 'SOLO_GERENTE';
      const c = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA, ITEM_COCINA]);
      const err: any = await cobrar(c.id, parcial, erp('CAJERO')).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toMatch(/Dividir la cuenta no está permitido/);
      await expect(cobrar(c.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, erp('CAJERO'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(venta(c.id).formasPago ?? []).toHaveLength(0);

      await cobrar(c.id, parcial, erp('GERENTE'));
      // el saldo restante ya es parte de una cuenta dividida: tampoco lo cobra el cajero
      await expect(cobrar(c.id, COMPLETO, erp('CAJERO'))).rejects.toBeInstanceOf(ForbiddenException);
      await cobrar(c.id, COMPLETO, erp('GERENTE'));
      expect(venta(c.id).status).toBe('PAGADA');
      expect(venta(c.id).formasPago.every((p: any) => p.dividido)).toBe(true);
    });

    it('SOLO_GERENTE: ADMIN siempre puede dividir; cobrar completo de una vez no es dividir', async () => {
      politicaDivision = 'SOLO_GERENTE';
      const c1 = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], 'mesa-1');
      await cobrar(c1.id, parcial, erp('ADMIN'));
      expect(venta(c1.id).formasPago[0].dividido).toBe(true);
      const c2 = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], 'mesa-2');
      await cobrar(c2.id, COMPLETO, erp('CAJERO'));
      expect(venta(c2.id).status).toBe('PAGADA');
    });

    it('mesero con MESERO_EN_MESA: cobra completo, pero dividir depende de la política de división', async () => {
      politicaCobro = 'MESERO_EN_MESA';
      const c = await abrirCuenta(lite('MESERO'));
      await expect(cobrar(c.id, parcial, lite('MESERO'))).rejects.toBeInstanceOf(ForbiddenException); // default: el mesero no divide
      politicaDivision = 'TODOS';
      await cobrar(c.id, parcial, lite('MESERO'));
      await cobrar(c.id, COMPLETO, lite('MESERO'));
      expect(venta(c.id).status).toBe('PAGADA');
      expect(venta(c.id).formasPago).toHaveLength(2);
      expect(venta(c.id).formasPago.map((p: any) => p.monto)).toEqual([40, 76]);
    });

    it('con TODOS pero SOLO_CAJA el mesero tampoco divide: primero debe poder cobrar', async () => {
      politicaDivision = 'TODOS';
      const c = await abrirCuenta(lite('MESERO'));
      await expect(cobrar(c.id, parcial, lite('MESERO'))).rejects.toThrow('solo se cobran en caja');
    });
  });

  // ── quitar ítem y cancelar ───────────────────────────────────────────────────────────────────────────────
  describe('mesero: quitar ítems y cancelar', () => {
    // Cuenta con dos ítems; el 1 ya salió a cocina (nota emitida).
    async function cuentaConCocina(tableId = 'mesa-1') {
      const c = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA, ITEM_COCINA], tableId);
      venta(c.id).items[1].notaCocinaId = 'nota-x';
      return c;
    }

    it('el mesero quita un ítem sin nota de cocina; con nota recibe 403 y la cuenta no cambia', async () => {
      const c = await cuentaConCocina();
      const err: any = await sales.quitarItem(c.id, 1, TENANT_A, lite('MESERO')).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toMatch(/aún no salieron a cocina o barra/);
      expect(venta(c.id).items[1].anulado).toBeFalsy();
      await sales.quitarItem(c.id, 0, TENANT_A, lite('MESERO'));
      expect(venta(c.id).items[0].anulado).toBe(true);
    });

    it('capitán y gerente sí quitan un ítem ya enviado (el comportamiento de siempre)', async () => {
      const c1 = await cuentaConCocina('mesa-1');
      await sales.quitarItem(c1.id, 1, TENANT_A, lite('CAPITAN'));
      expect(venta(c1.id).items[1].anulado).toBe(true);
      const c2 = await cuentaConCocina('mesa-2');
      await sales.quitarItem(c2.id, 1, TENANT_A, erp('GERENTE'));
      expect(venta(c2.id).items[1].anulado).toBe(true);
    });

    it('el mesero cancela una cuenta sin ítems enviados: stock devuelto y mesa libre', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      expect(stock()).toBe(98);
      await sales.cancel(c.id, 'cliente se fue', TENANT_A, lite('MESERO'));
      expect(venta(c.id).status).toBe('CANCELADA');
      expect(stock()).toBe(100);
      expect(mesa()).toBe('AVAILABLE');
    });

    it('el mesero NO cancela una cuenta con ítems enviados (403, nada cambia); el capitán sí', async () => {
      const c = await cuentaConCocina();
      const stockAntes = stock();
      const err: any = await sales.cancel(c.id, 'x', TENANT_A, lite('MESERO')).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toMatch(/sin ítems enviados a cocina o barra/);
      expect(venta(c.id).status).toBe('ABIERTA');
      expect(stock()).toBe(stockAntes);
      expect(mesa()).toBe('OCCUPIED');
      await sales.cancel(c.id, 'error de captura', TENANT_A, lite('CAPITAN'));
      expect(venta(c.id).status).toBe('CANCELADA');
    });

    it('una cuenta con pagos no se cancela, ni el mesero ni nadie (400)', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      await cobrar(c.id, { formaPago: 'EFECTIVO', monto: 40 }, erp('GERENTE'));
      await expect(sales.cancel(c.id, 'x', TENANT_A, lite('MESERO'))).rejects.toBeInstanceOf(BadRequestException);
      await expect(sales.cancel(c.id, 'x', TENANT_A, erp('GERENTE'))).rejects.toBeInstanceOf(BadRequestException);
      expect(venta(c.id).status).toBe('ABIERTA');
    });
  });

  // ── corte Z y getSummary: efectivo por persona ───────────────────────────────────────────────────────────
  describe('efectivo fuera de caja por persona — corte Z y getSummary', () => {
    // mesero Ana (2 cuentas de $116), capitán Beto (cuenta de $116: 60 efectivo + 56 tarjeta) y un cajero ERP ($116).
    async function turnoConCobros() {
      politicaCobro = 'MESERO_EN_MESA';
      politicaDivision = 'TODOS';
      const ana = { ...lite('MESERO'), id: 'u-ana', email: 'ana@lite' };
      const beto = { ...lite('CAPITAN'), id: 'u-beto', email: 'beto@lite' };
      mesas.set('mesa-3', { id: 'mesa-3', tenantId: TENANT_A, number: 3, status: 'AVAILABLE', isActive: true });
      mesas.set('mesa-4', { id: 'mesa-4', tenantId: TENANT_A, number: 4, status: 'AVAILABLE', isActive: true });
      const c1 = await abrirCuenta(ana, {}, [ITEM_SIN_COCINA], 'mesa-1');
      await cobrar(c1.id, COMPLETO, ana);
      const c2 = await abrirCuenta(ana, {}, [ITEM_SIN_COCINA], 'mesa-1');
      await cobrar(c2.id, COMPLETO, ana);
      const c3 = await abrirCuenta(beto, {}, [ITEM_SIN_COCINA], 'mesa-2');
      await cobrar(c3.id, { formaPago: 'EFECTIVO', monto: 60 }, beto);
      await cobrar(c3.id, { formaPago: 'TARJETA' }, beto);
      const c4 = await abrirCuenta(erp('CAJERO'), {}, [ITEM_SIN_COCINA], 'mesa-3');
      await cobrar(c4.id, COMPLETO, erp('CAJERO'));
      return { ana, beto };
    }

    it('las cuentas de mesa abiertas por la tableta entran al turno abierto de la sucursal', async () => {
      await turnoConCobros();
      const todas = [...ventas.values()];
      expect(todas).toHaveLength(4);
      expect(todas.every((v) => v.turnoId === 'turno-1')).toBe(true);
    });

    it('corte Z: el efectivo del corte no cambia y se agrega el desglose por persona (solo origen MESA)', async () => {
      await turnoConCobros();
      const cerrado: any = await shiftsService.closeShift('turno-1', { efectivoContado: 408 }, TENANT_A);
      // 116 + 116 (Ana) + 60 (Beto) + 116 (cajero) = 408 — mismo número que sin desglose; la tarjeta aparte
      expect(cerrado.totalEfectivo).toBe(408);
      expect(cerrado.totalTarjeta).toBe(56);
      expect(cerrado.totalVentas).toBe(464);
      expect(turnos.get('turno-1').totalEfectivo).toBe(408);
      expect(cerrado.efectivoPorPersona).toEqual({
        personas: [
          { email: 'ana@lite', id: 'u-ana', rol: 'MESERO', monto: 232 },
          { email: 'beto@lite', id: 'u-beto', rol: 'CAPITAN', monto: 60 },
        ],
        total: 292,
      });
    });

    it('getSummary: mismo desglose, y efectivoEsperado sigue incluyendo todo el efectivo (también el de mesa)', async () => {
      await turnoConCobros();
      turnos.get('turno-1').fondoInicial = 500;
      const s: any = await shiftsService.getSummary('turno-1', TENANT_A);
      expect(s.calculatedTotals.totalVentasEfectivo).toBe(408);
      expect(s.calculatedTotals.efectivoEsperado).toBe(908);
      expect(s.calculatedTotals.efectivoPorPersona.total).toBe(292);
      expect(s.calculatedTotals.efectivoPorPersona.personas.map((p: any) => [p.email, p.monto])).toEqual([["ana@lite", 232], ['beto@lite', 60]]);
    });

    it('getSummary vuelve a dar el desglose de un turno ya cerrado, igual que el corte', async () => {
      await turnoConCobros();
      const cerrado: any = await shiftsService.closeShift('turno-1', {}, TENANT_A);
      const s: any = await shiftsService.getSummary('turno-1', TENANT_A);
      expect(s.calculatedTotals.efectivoPorPersona).toEqual(cerrado.efectivoPorPersona);
    });

    it('sin cobros desde mesa: desglose vacío y el corte no cambia', async () => {
      const c = await abrirCuenta(erp('CAJERO'));
      await cobrar(c.id, COMPLETO, erp('CAJERO'));
      const cerrado: any = await shiftsService.closeShift('turno-1', {}, TENANT_A);
      expect(cerrado.totalEfectivo).toBe(116);
      expect(cerrado.efectivoPorPersona).toEqual({ personas: [], total: 0 });
    });

    it('el corte sigue bloqueado mientras haya cuentas abiertas en mesas', async () => {
      await abrirCuenta(lite('MESERO'));
      await expect(shiftsService.closeShift('turno-1', {}, TENANT_A)).rejects.toThrow(/cuenta\(s\) abierta\(s\) en mesas/);
      expect(turnos.get('turno-1').status).toBe('ABIERTO');
    });
  });

  // ── aislamiento de tenant ────────────────────────────────────────────────────────────────────────────────
  describe('aislamiento de tenant', () => {
    it('otro tenant no cobra, quita ítems, cancela ni cobra por /pay una cuenta ajena; nada cambia', async () => {
      const c = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA, ITEM_COCINA]);
      const antes = JSON.stringify(venta(c.id));
      await expect(cobrar(c.id, COMPLETO, erp('ADMIN'), TENANT_B)).rejects.toThrow();
      await expect(sales.quitarItem(c.id, 0, TENANT_B, erp('ADMIN'))).rejects.toThrow();
      await expect(sales.cancel(c.id, 'x', TENANT_B, erp('ADMIN'))).rejects.toThrow();
      await expect(sales.pay(c.id, { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 }, TENANT_B, erp('ADMIN'))).rejects.toThrow();
      expect(JSON.stringify(venta(c.id))).toBe(antes);
      expect(mesa()).toBe('OCCUPIED');
    });

    it('otro tenant no ve ni cierra el turno ni su efectivo por persona', async () => {
      politicaCobro = 'MESERO_EN_MESA';
      const c = await abrirCuenta(lite('MESERO'));
      await cobrar(c.id, COMPLETO, lite('MESERO'));
      await expect(shiftsService.getSummary('turno-1', TENANT_B)).rejects.toThrow('Turno no encontrado');
      await expect(shiftsService.closeShift('turno-1', {}, TENANT_B)).rejects.toThrow('Turno no encontrado');
      expect(turnos.get('turno-1').status).toBe('ABIERTO');
    });
  });

  // ── precio e IVA los pone el servidor ────────────────────────────────────────────────────────────────────
  describe('cuenta abierta — precio e IVA en el servidor (el cliente no decide)', () => {
    it('abrir cuenta: ignora precioUnitario, subtotal y total del cliente; IVA 16% sobre el neto', async () => {
      const tramposo = { ...ITEM_SIN_COCINA, precioUnitario: 0.01, subtotal: 0.02 };
      const c = await abrirCuenta(lite('MESERO'), { total: 1, subtotal: 1, impuestos: 0, descuento: 99 }, [tramposo]);
      expect(venta(c.id)).toMatchObject({ subtotal: 100, impuestos: 16, total: 116, descuento: 0 });
      expect(venta(c.id).items[0]).toMatchObject({ precioUnitario: 50, subtotal: 100, descuento: 0, nombre: 'Taco' });
    });

    it('agregar ítems: precio de catálogo e IVA del servidor, aunque el cliente mande otros', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      await sales.agregarItems(c.id, { items: [{ ...ITEM_COCINA, precioUnitario: 1, subtotal: 1 }], impuestos: 0 }, TENANT_A);
      expect(venta(c.id)).toMatchObject({ subtotal: 160, impuestos: 25.6, total: 185.6 });
      expect(venta(c.id).items[1]).toMatchObject({ precioUnitario: 60, subtotal: 60, descuento: 0 });
    });

    it('agregar ítems con descuento por ítem: 400 (el descuento va por PUT /discount)', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      await expect(sales.agregarItems(c.id, { items: [{ ...ITEM_COCINA, descuento: 50 }] }, TENANT_A)).rejects.toBeInstanceOf(BadRequestException);
      expect(venta(c.id).total).toBe(116);
    });

    it('mismo cálculo que el POS normal: neto × 16%, a centavos', async () => {
      const c = await abrirCuenta(lite('MESERO'), {}, [{ ...ITEM_SIN_COCINA, cantidad: 3 }]);
      expect(venta(c.id)).toMatchObject({ subtotal: 150, impuestos: 24, total: 174 });
    });

    it('producto inexistente o de otro tenant: 400 y no queda nada', async () => {
      await expect(abrirCuenta(lite('MESERO'), {}, [{ ...ITEM_SIN_COCINA, productoId: 'no-existe' }])).rejects.toBeInstanceOf(BadRequestException);
      expect(ventas.size).toBe(0);
      expect(mesa()).toBe('AVAILABLE');
      const c = await abrirCuenta(lite('MESERO'));
      await expect(sales.agregarItems(c.id, { items: [{ ...ITEM_SIN_COCINA, productoId: 'no-existe' }] }, TENANT_A)).rejects.toBeInstanceOf(BadRequestException);
      expect(venta(c.id).total).toBe(116);
    });
  });

  // ── descuento: ADMIN, GERENTE, CAPITAN y CAJERO ──────────────────────────────────────────────────────────
  describe('PUT /discount — solo ADMIN, GERENTE, CAPITAN y CAJERO', () => {
    it.each(['ADMIN', 'GERENTE', 'CAPITAN', 'CAJERO'])('%s (ERP o POS Lite) aplica el descuento', async (rol) => {
      const mesas2 = ['mesa-1', 'mesa-2'];
      for (const [i, actor] of [erp(rol), lite(rol)].entries()) {
        const c = await abrirCuenta(lite('MESERO'), {}, [ITEM_SIN_COCINA], mesas2[i]);
        await sales.applyDiscount(c.id, 11.6, 104.4, TENANT_A, actor); // 10% de $116: dentro del tope de los cuatro roles
        expect(venta(c.id)).toMatchObject({ descuento: 11.6, total: 104.4 });
      }
    });

    // Cuenta de $116 (100 + IVA 16). CAJERO hasta 10% ($11.60), CAPITAN hasta 20% ($23.20), GERENTE y ADMIN sin tope.
    describe('tope de descuento por rol', () => {
      it('CAJERO: $11.60 (10%) pasa; $11.61 da 403 y la cuenta no cambia', async () => {
        const c = await abrirCuenta(lite('MESERO'));
        const err: any = await sales.applyDiscount(c.id, 11.61, 104.39, TENANT_A, erp('CAJERO')).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toBe('Tu rol (CAJERO) puede dar hasta 10% de descuento y pediste 10.01%. Pide a un capitán o gerente.');
        expect(venta(c.id)).toMatchObject({ descuento: 0, total: 116 });
        await sales.applyDiscount(c.id, 11.6, 104.4, TENANT_A, erp('CAJERO'));
        expect(venta(c.id)).toMatchObject({ descuento: 11.6, total: 104.4 });
      });

      it('CAPITAN: $23.20 (20%) pasa; $23.21 da 403', async () => {
        const c = await abrirCuenta(lite('MESERO'));
        await expect(sales.applyDiscount(c.id, 23.21, 92.79, TENANT_A, lite('CAPITAN'))).rejects.toBeInstanceOf(ForbiddenException);
        expect(venta(c.id).total).toBe(116);
        await sales.applyDiscount(c.id, 23.2, 92.8, TENANT_A, lite('CAPITAN'));
        expect(venta(c.id)).toMatchObject({ descuento: 23.2, total: 92.8 });
      });

      it.each(['GERENTE', 'ADMIN'])('%s: 50% ($58) y hasta 100% ($116) sin tope', async (rol) => {
        const c = await abrirCuenta(lite('MESERO'));
        await sales.applyDiscount(c.id, 58, 58, TENANT_A, erp(rol));
        expect(venta(c.id)).toMatchObject({ descuento: 58, total: 58 });
        await sales.applyDiscount(c.id, 116, 0, TENANT_A, erp(rol));
        expect(venta(c.id)).toMatchObject({ descuento: 116, total: 0 });
      });

      it('el tope no se evade mandando un descuento chico con un nuevoTotal en cero: no cuadra → 400, cuenta intacta', async () => {
        const c = await abrirCuenta(lite('MESERO'));
        await expect(sales.applyDiscount(c.id, 1, 0.01, TENANT_A, erp('CAJERO'))).rejects.toBeInstanceOf(BadRequestException);
        await expect(sales.applyDiscount(c.id, 1, 0, TENANT_A, erp('GERENTE'))).rejects.toBeInstanceOf(BadRequestException);
        expect(venta(c.id)).toMatchObject({ descuento: 0, total: 116 });
      });
    });

    it('el mesero (ERP o POS Lite) y cualquier otro rol reciben 403 y la cuenta no cambia', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      for (const actor of [lite('MESERO'), erp('MESERO'), erp('CONTADOR'), erp('SOPORTE'), {}]) {
        const err: any = await sales.applyDiscount(c.id, 50, 66, TENANT_A, actor as any).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
      }
      expect(venta(c.id)).toMatchObject({ total: 116, descuento: 0 });
    });

    it('un descuento no sube el total ni lo deja negativo; números inválidos: 400', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      await expect(sales.applyDiscount(c.id, 0, 200, TENANT_A, erp('GERENTE'))).rejects.toThrow('mayor al total actual');
      await expect(sales.applyDiscount(c.id, 10, -1, TENANT_A, erp('GERENTE'))).rejects.toBeInstanceOf(BadRequestException);
      await expect(sales.applyDiscount(c.id, -5, 100, TENANT_A, erp('GERENTE'))).rejects.toBeInstanceOf(BadRequestException);
      await expect(sales.applyDiscount(c.id, NaN, 100, TENANT_A, erp('GERENTE'))).rejects.toBeInstanceOf(BadRequestException);
      expect(venta(c.id).total).toBe(116);
    });

    it('con pagos parciales no se aplica descuento', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      await cobrar(c.id, { formaPago: 'EFECTIVO', monto: 40 }, erp('GERENTE'));
      await expect(sales.applyDiscount(c.id, 10, 106, TENANT_A, erp('GERENTE'))).rejects.toThrow(/pagos parciales/);
    });

    it('aislamiento de tenant: otro tenant no descuenta una cuenta ajena', async () => {
      const c = await abrirCuenta(lite('MESERO'));
      await expect(sales.applyDiscount(c.id, 50, 66, TENANT_B, erp('ADMIN'))).rejects.toThrow('Venta no encontrada');
      expect(venta(c.id)).toMatchObject({ total: 116, descuento: 0 });
    });
  });
});
