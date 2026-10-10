import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesService } from '../pos/sales.service';
import { Sale } from '../pos/entities/sale.entity';
import { Shift } from '../pos/entities/shift.entity';
import { Product } from '../pos/entities/product.entity';
import { NotaCocina } from '../pos/entities/nota-cocina.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from '../pos/insumo-alerts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';
import { MembresiasCoreService } from './membresias-core.service';
import { Socio } from './entities/socio.entity';
import { PlanMembresia } from './entities/plan-membresia.entity';
import { Membresia } from './entities/membresia.entity';

// El cobro de una membresía es una venta normal del POS: precio e IVA los calcula el servidor (el plan es un producto), la
// membresía nace en la MISMA transacción, el beneficio del socio pasa por los topes por rol y devolver la venta cancela el
// periodo. SalesService y MembresiasCoreService REALES sobre una BD en memoria con rollback de verdad.
// Reloj fijo: 2026-10-05 14:00 UTC = 07:00 en Tijuana → "hoy" es 2026-10-05.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SUC = 'sucursal-A';
const erp = (roleCode: string) => ({ id: `u-${roleCode}`, email: `${roleCode.toLowerCase()}@gym`, roleCode, posLiteAccess: false });

describe('Membresías en el POS — cobro, renovación, beneficio y devolución', () => {
  let sales: SalesService;
  let ventas: Map<string, any>;
  let membresias: any[];
  let socios: Map<string, any>;
  let planes: Map<string, any>;
  let turnos: Map<string, any>;
  let caps: Record<string, boolean>;
  let ivaCfg: { ivaTasaDefault: string; preciosIncluyenIva: boolean };
  let nextId: number;
  let fallaGuardarMembresia: boolean;

  const matches = (row: any, where: any) =>
    Object.entries(where || {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(row[k]);
      return row[k] === v;
    });
  const clone = (x: any) => JSON.parse(JSON.stringify(x));

  const PRODUCTS: Record<string, any> = {
    'p-agua': { id: 'p-agua', type: 'SIMPLE', insumoId: null, recipeId: null, tenantId: TENANT_A, name: 'Agua', price: 50, esServicio: false },
    'p-plan-mensual': { id: 'p-plan-mensual', type: 'SIMPLE', insumoId: null, recipeId: null, tenantId: TENANT_A, name: 'Membresía: Mensual', price: 500, esServicio: true },
    'p-plan-exento': { id: 'p-plan-exento', type: 'SIMPLE', insumoId: null, recipeId: null, tenantId: TENANT_A, name: 'Membresía: Escolar', price: 500, esServicio: true, tasaIva: 'EXENTO' },
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
          if ([...ventas.values()].some((v) => v.folio === rest.folio)) throw Object.assign(new Error('duplicate'), { code: '23505' });
          const row = { id: `sale-${++nextId}`, createdAt: new Date(), ...rest };
          ventas.set(row.id, row);
          return Promise.resolve({ ...row });
        }
        if (__entity === Membresia) {
          if (fallaGuardarMembresia) throw new Error('fallo simulado al guardar la membresía');
          const row = { id: `mem-${++nextId}`, diasCongelados: 0, congeladaDesde: null, notas: null, ...rest };
          membresias.push(row);
          return Promise.resolve({ ...row });
        }
        return Promise.resolve(rest);
      }),
      findOne: jest.fn((entity: any, opts: any) => {
        if (entity === Product) return productLookup(opts.where);
        const mapa = entity === Sale ? [...ventas.values()] : entity === Shift ? [...turnos.values()] : entity === Socio ? [...socios.values()] : [];
        const fila = mapa.find((r) => matches(r, opts.where));
        return Promise.resolve(fila ? clone(fila) : null);
      }),
      find: jest.fn((entity: any, opts: any) => {
        const filas = entity === Membresia ? membresias : [];
        return Promise.resolve(filas.filter((r) => matches(r, opts.where)).map(clone));
      }),
      update: jest.fn((entity: any, criteria: any, patch: any) => {
        const filas = entity === Sale ? [...ventas.values()] : entity === Membresia ? membresias : [];
        for (const r of filas) if (typeof criteria === 'string' ? r.id === criteria : matches(r, criteria)) Object.assign(r, patch);
        return Promise.resolve(undefined);
      }),
    };
  }

  const hoyFijo = () => {
    jest.useFakeTimers({
      now: new Date('2026-10-05T14:00:00Z'),
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'hrtime', 'performance'],
    });
  };
  beforeAll(hoyFijo);
  afterAll(() => jest.useRealTimers());

  beforeEach(async () => {
    caps = { membresias: true };
    ivaCfg = { ivaTasaDefault: '16', preciosIncluyenIva: false };
    nextId = 0;
    fallaGuardarMembresia = false;
    ventas = new Map();
    membresias = [];
    socios = new Map([
      ['socio-1', { id: 'socio-1', tenantId: TENANT_A, numeroSocio: '1', nombre: 'Ana', estado: 'ACTIVO' }],
      ['socio-baja', { id: 'socio-baja', tenantId: TENANT_A, numeroSocio: '9', nombre: 'Baja', estado: 'BAJA' }],
      ['socio-B', { id: 'socio-B', tenantId: TENANT_B, numeroSocio: '1', nombre: 'Ajeno', estado: 'ACTIVO' }],
    ]);
    planes = new Map([
      ['plan-mensual', { id: 'plan-mensual', tenantId: TENANT_A, nombre: 'Mensual', productId: 'p-plan-mensual', periodoTipo: 'MESES', periodoCantidad: 1, activo: true, beneficios: { descuentoPct: 10 } }],
      ['plan-exento', { id: 'plan-exento', tenantId: TENANT_A, nombre: 'Escolar', productId: 'p-plan-exento', periodoTipo: 'MESES', periodoCantidad: 1, activo: true, beneficios: {} }],
      ['plan-b', { id: 'plan-b', tenantId: TENANT_B, nombre: 'Ajeno', productId: 'p-plan-b', periodoTipo: 'MESES', periodoCantidad: 1, activo: true, beneficios: {} }],
    ]);
    turnos = new Map([['turno-1', { id: 'turno-1', tenantId: TENANT_A, sucursalId: SUC, cajero: 'caja', status: 'ABIERTO', precorteGuardado: true, createdAt: new Date() }]]);

    const salesRepo = {
      findOne: jest.fn(({ where }: any) => Promise.resolve([...ventas.values()].find((r) => matches(r, where)) ?? null)),
      find: jest.fn(() => Promise.resolve([])),
      update: jest.fn(),
    };
    const sociosRepo = { findOne: jest.fn(({ where }: any) => Promise.resolve([...socios.values()].find((r) => matches(r, where)) ?? null)) };
    const planesRepo = {
      find: jest.fn(({ where }: any) => Promise.resolve([...planes.values()].filter((r) => matches(r, where)))),
      findOne: jest.fn(({ where }: any) => Promise.resolve([...planes.values()].find((r) => matches(r, where)) ?? null)),
    };
    const membresiasRepo = { find: jest.fn(({ where }: any) => Promise.resolve(membresias.filter((r) => matches(r, where)).map(clone))) };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const sv = new Map([...ventas].map(([k, v]) => [k, clone(v)]));
        const sm = membresias.map(clone);
        try {
          return await cb(buildManager());
        } catch (e) {
          ventas = sv;
          membresias = sm;
          throw e;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        MembresiasCoreService,
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn(({ where }: any) => productLookup(where)) } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn(() => Promise.resolve(null)) } },
        { provide: getRepositoryToken(Socio), useValue: sociosRepo },
        { provide: getRepositoryToken(PlanMembresia), useValue: planesRepo },
        { provide: getRepositoryToken(Membresia), useValue: membresiasRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: InsumoAlertsService, useValue: { upsert: jest.fn() } },
        { provide: AppointmentsService, useValue: {} },
        { provide: CostsService, useValue: { createJustifiable: jest.fn() } },
        {
          provide: TenantSettingsService,
          useValue: {
            hasPosCapability: jest.fn((_t: string, cap: string) => Promise.resolve(!!caps[cap])),
            getIvaConfig: jest.fn(() => Promise.resolve({ ...ivaCfg })),
            getPoliticaCobro: jest.fn(() => Promise.resolve('SOLO_CAJA')),
            getPoliticaDivisionCuentas: jest.fn(() => Promise.resolve('GERENTE_CAPITAN_CAJERO')),
            getPoliticaDevoluciones: jest.fn(() => Promise.resolve('SOLO_GERENTE')),
          },
        },
      ],
    }).compile();
    sales = module.get(SalesService);
  });

  const item = (productoId: string, cantidad = 1) => ({ productoId, nombre: 'x', cantidad, precioUnitario: 1, descuento: 0, subtotal: 1 });
  const vender = (actor: any, items: any[], monto: number | null, extra: Record<string, any> = {}) =>
    sales.create({
      items, subtotal: 1, descuento: 0, impuestos: 0, total: 1,
      ...(monto === null ? {} : { formasPago: [{ forma: 'EFECTIVO', monto }] }),
      cajero: 'texto', turnoId: 'turno-1', sucursalId: SUC, tenantId: TENANT_A, folio: `VTA-${++nextId}`, ...extra,
    } as any, actor);
  const sinNada = () => { expect(ventas.size).toBe(0); expect(membresias).toHaveLength(0); };

  describe('cobro de una membresía', () => {
    it('plan de $500 al 16 %: el servidor cobra 580 (IVA 80) y la membresía queda del 5 de octubre al 4 de noviembre', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ status: 'PAGADA', subtotal: 500, impuestos: 80, total: 580 });
      expect(ventas.get(v.id).notas).toContain('[Socio #1 Ana · Mensual]');
      expect(membresias).toHaveLength(1);
      expect(membresias[0]).toMatchObject({
        socioId: 'socio-1', planId: 'plan-mensual', planNombre: 'Mensual', precioPagado: 580,
        fechaInicio: '2026-10-05', fechaFin: '2026-11-04', estado: 'ACTIVA', ventaId: v.id, folioVenta: v.folio,
      });
    });

    it('el precio y el IVA NO los decide el cliente: manda $1 y el pago de $1 no cubre → 400 y no queda nada', async () => {
      const err: any = await vender(erp('RECEPCION'), [{ ...item('p-plan-mensual'), precioUnitario: 1 }], 1, { socioId: 'socio-1' }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/no cubren el total/);
      sinNada();
    });

    it('precios con IVA incluido: el plan de $500 cuesta $500 (base 431.03 + IVA 68.97)', async () => {
      ivaCfg = { ivaTasaDefault: '16', preciosIncluyenIva: true };
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 500, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ subtotal: 431.03, impuestos: 68.97, total: 500 });
      expect(membresias[0].precioPagado).toBe(500);
    });

    it('plan exento (tasa propia del producto): $500, IVA 0', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-plan-exento')], 500, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ subtotal: 500, impuestos: 0, total: 500 });
      expect(ventas.get(v.id).items[0].tasaIva).toBe('EXENTO');
    });

    it('con el negocio al 8 %: $540 (IVA 40)', async () => {
      ivaCfg = { ivaTasaDefault: '8', preciosIncluyenIva: false };
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 540, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ impuestos: 40, total: 540 });
    });

    it('mezcla con un producto: membresía 580 + agua 2 × $50 = 696 (la membresía nace igual)', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual'), item('p-agua', 2)], 696, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ subtotal: 600, impuestos: 96, total: 696 });
      expect(membresias).toHaveLength(1);
    });
  });

  describe('renovación', () => {
    it('antes de vencer: el nuevo periodo empieza al día siguiente del fin del anterior (sin regalar ni perder días)', async () => {
      await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      expect(membresias.map((m) => [m.fechaInicio, m.fechaFin])).toEqual([['2026-10-05', '2026-11-04'], ['2026-11-05', '2026-12-04']]);
    });

    it('ya vencida: el periodo nuevo empieza hoy', async () => {
      membresias.push({ id: 'vieja', tenantId: TENANT_A, socioId: 'socio-1', estado: 'ACTIVA', fechaInicio: '2026-08-01', fechaFin: '2026-08-31' });
      await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      expect(membresias[1]).toMatchObject({ fechaInicio: '2026-10-05', fechaFin: '2026-11-04' });
    });

    it('congelada: no se renueva (400) y no queda venta ni membresía nueva', async () => {
      membresias.push({ id: 'cong', tenantId: TENANT_A, socioId: 'socio-1', estado: 'CONGELADA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
      const err: any = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' }).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/congelada/);
      expect(ventas.size).toBe(0);
      expect(membresias).toHaveLength(1);
    });
  });

  describe('lo que se rechaza', () => {
    it('membresía sin socio: 400', async () => {
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual')], 580)).rejects.toThrow(/eligiendo al socio/);
      sinNada();
    });

    it('socio de OTRO negocio, inexistente o dado de baja: 400 con el mismo mensaje y sin rastro', async () => {
      for (const socioId of ['socio-B', 'no-existe']) {
        const err: any = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId }).catch((e) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toBe('Socio no encontrado.');
      }
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-baja' })).rejects.toThrow(/dado de baja/);
      sinNada();
    });

    it('plan desactivado, cantidad distinta de 1 y dos membresías en la misma venta: 400', async () => {
      planes.get('plan-mensual').activo = false;
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' })).rejects.toThrow(/desactivado/);
      planes.get('plan-mensual').activo = true;
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual', 2)], 1160, { socioId: 'socio-1' })).rejects.toThrow(/cantidad 1/);
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual'), item('p-plan-exento')], 1080, { socioId: 'socio-1' })).rejects.toThrow(/una sola membresía/);
      sinNada();
    });

    it('membresía sin pago (venta abierta): 400', async () => {
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual')], null, { socioId: 'socio-1' })).rejects.toThrow(/al momento/);
      sinNada();
    });

    it('si falla guardar la membresía, la venta se revierte completa', async () => {
      fallaGuardarMembresia = true;
      await expect(vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' })).rejects.toThrow();
      sinNada();
    });

    it('sin la capacidad membresias: socioId se ignora y el plan se vende como un producto cualquiera (sin membresía)', async () => {
      caps.membresias = false;
      const v = await vender(erp('CAJERO'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      expect(ventas.get(v.id).total).toBe(580);
      expect(membresias).toHaveLength(0);
    });
  });

  describe('beneficio del socio (descuento del plan) con los topes por rol', () => {
    beforeEach(() => {
      membresias.push({ id: 'vigente', tenantId: TENANT_A, socioId: 'socio-1', planId: 'plan-mensual', estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: '2026-10-31' });
    });

    it('plan con 10 %: 2 × $50 → descuento 10, IVA 14.40, total 104.40; lo anota en la venta', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-agua', 2)], 104.4, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ subtotal: 100, descuento: 10, impuestos: 14.4, total: 104.4 });
      expect(ventas.get(v.id).items[0].descuento).toBe(10);
      expect(ventas.get(v.id).notas).toContain('beneficio 10%');
    });

    it('sin socioId no hay beneficio: 2 × $50 → 116', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-agua', 2)], 116);
      expect(ventas.get(v.id)).toMatchObject({ descuento: 0, total: 116 });
    });

    it('un beneficio de 15 %: CAJERO y RECEPCION (tope 10 %) reciben 403 y no queda venta; CAPITAN y GERENTE sí', async () => {
      planes.get('plan-mensual').beneficios = { descuentoPct: 15 };
      for (const rol of ['CAJERO', 'RECEPCION']) {
        const err: any = await vender(erp(rol), [item('p-agua', 2)], 98.6, { socioId: 'socio-1' }).catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toContain('hasta 10%');
      }
      expect(ventas.size).toBe(0);
      const v = await vender(erp('GERENTE'), [item('p-agua', 2)], 98.6, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ subtotal: 100, descuento: 15, impuestos: 13.6, total: 98.6 });
    });

    it('un rol sin permiso de descuento (mesero) no aplica el beneficio: 403', async () => {
      await expect(vender(erp('MESERO'), [item('p-agua', 2)], 104.4, { socioId: 'socio-1' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(ventas.size).toBe(0);
    });

    it('el beneficio no baja el precio de la membresía misma: renovar con beneficio sigue costando 580', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ descuento: 0, total: 580 });
    });

    it('socio sin membresía vigente (vencida): sin beneficio', async () => {
      membresias[0].fechaFin = '2026-09-30';
      membresias[0].fechaInicio = '2026-09-01';
      const v = await vender(erp('RECEPCION'), [item('p-agua', 2)], 116, { socioId: 'socio-1' });
      expect(ventas.get(v.id)).toMatchObject({ descuento: 0, total: 116 });
    });
  });

  describe('devolución', () => {
    it('devolver la venta de una membresía cancela ese periodo (queda el rastro) y la venta pasa a DEVUELTA', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      expect(membresias[0].estado).toBe('ACTIVA');
      const dev: any = await sales.returnSale(v.id, { motivo: 'se arrepintió' }, TENANT_A, erp('GERENTE'));
      expect(dev).toMatchObject({ status: 'DEVOLUCION', total: 580, impuestos: 80 });
      expect(ventas.get(v.id).status).toBe('DEVUELTA');
      expect(membresias[0].estado).toBe('CANCELADA');
      expect(membresias[0].notas).toContain(`Devolución de la venta ${v.folio}: se arrepintió`);
    });

    it('aislamiento: otro negocio no devuelve la venta ni toca la membresía', async () => {
      const v = await vender(erp('RECEPCION'), [item('p-plan-mensual')], 580, { socioId: 'socio-1' });
      await expect(sales.returnSale(v.id, { motivo: 'x' }, TENANT_B, erp('GERENTE'))).rejects.toThrow();
      expect(membresias[0].estado).toBe('ACTIVA');
      expect(ventas.get(v.id).status).toBe('PAGADA');
    });
  });
});
