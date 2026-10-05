import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { ShiftsService } from './shifts.service';
import { Sale } from './entities/sale.entity';
import { Shift } from './entities/shift.entity';
import { Product } from './entities/product.entity';
import { NotaCocina } from './entities/nota-cocina.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { InventoryMovement } from '../costs/entities/inventory-movement.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from './insumo-alerts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CostsService } from '../costs/costs.service';

// Devolución total de una venta PAGADA (returnSale). Toca dinero, inventario y el corte Z, así que
// se prueba contra SalesService y ShiftsService REALES; solo se simula la BD con una en memoria que
// respeta tenant, filtros In(...) y hace rollback de verdad si la transacción lanza.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const GERENTE = { id: 'u-gerente', email: 'gerente@demo.com', roleCode: 'GERENTE' };
const CAJERO = { id: 'u-cajero', email: 'cajero@demo.com', roleCode: 'CAJERO' };
const ADMIN = { id: 'u-admin', email: 'admin@demo.com', roleCode: 'ADMIN' };

describe('SalesService.returnSale() — devolución total', () => {
  let sales: Service;
  let shiftsService: ShiftsService;
  let ventas: Map<string, any>;
  let turnos: Map<string, any>;
  let insumos: Map<string, any>;
  let notas: any[];
  let mermas: any[];
  let movimientos: any[];
  let shiftUpdates: Array<{ id: string; patch: any }>;
  let caps: Record<string, boolean>;
  let politicas: Record<string, string | undefined>;
  let failRestoreOn: string | null;
  let failMermaWrite: boolean;
  let nextId: number;

  type Service = SalesService;

  const matches = (row: any, where: any) =>
    Object.entries(where || {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && v._type === 'in') return v._value.includes(row[k]);
      if (v && typeof v === 'object' && '_type' in v) return row[k] !== null && row[k] !== undefined; // Not(IsNull())
      return row[k] === v;
    });
  const clone = (x: any) => JSON.parse(JSON.stringify(x));
  const snapshot = () => ({
    ventas: new Map([...ventas].map(([k, v]) => [k, clone(v)])),
    insumos: new Map([...insumos].map(([k, v]) => [k, { ...v }])),
    notas: notas.map((n) => ({ ...n })),
    mermas: clone(mermas),
    movimientos: movimientos.map((m) => ({ ...m })),
  });
  const restore = (s: ReturnType<typeof snapshot>) => {
    ventas = s.ventas; insumos = s.insumos; notas = s.notas; mermas = s.mermas; movimientos = s.movimientos;
  };
  const mapFor = (entity: any): Map<string, any> | null =>
    entity === Sale ? ventas : entity === Shift ? turnos : entity === Insumo ? insumos : null;

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
        const row = [...m.values()].find((r) => matches(r, opts.where));
        return Promise.resolve(row ? clone(row) : null);
      }),
      update: jest.fn((entity: any, criteria: any, patch: any) => {
        if (entity === NotaCocina) {
          for (const n of notas) if (matches(n, criteria)) Object.assign(n, patch);
          return Promise.resolve(undefined);
        }
        if (entity === Insumo && failRestoreOn === criteria && patch.stockActual > insumos.get(criteria).stockActual) {
          return Promise.reject(new Error(`fallo simulado al reponer ${criteria}`));
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

  // Venta ya cobrada. formasPago = pagos mixtos; sin ella, un solo pago con `formaPago` (como pay()).
  async function crearPagada(opts: { items?: any[]; formasPago?: any[]; formaPago?: string; turnoId?: string; tenantId?: string } = {}): Promise<any> {
    const items = opts.items ?? [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 2, precioUnitario: 50, descuento: 0, subtotal: 100 }];
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    const base = {
      items, subtotal: total, descuento: 0, impuestos: 0, total,
      cajero: 'cajero-1', turnoId: opts.turnoId ?? 'turno-1', sucursalId: 'sucursal-A', tenantId: opts.tenantId ?? TENANT_A,
      folio: `VTA-${++nextId}`,
    };
    if (opts.formasPago) return sales.create({ ...base, formasPago: opts.formasPago } as any);
    const abierta = await sales.create(base as any);
    return sales.pay(abierta.id, { formaPago: opts.formaPago ?? 'EFECTIVO', montoRecibido: total, cambio: 0 } as any, base.tenantId);
  }

  const devoluciones = () => [...ventas.values()].filter((v) => v.status === 'DEVOLUCION');
  const stock = (id = 'ins-1') => insumos.get(id).stockActual;

  beforeEach(async () => {
    caps = {};
    politicas = {};
    nextId = 0;
    failRestoreOn = null;
    failMermaWrite = false;
    ventas = new Map();
    turnos = new Map([
      ['turno-1', { id: 'turno-1', tenantId: TENANT_A, sucursalId: 'sucursal-A', cajero: 'cajero-1', status: 'ABIERTO', precorteGuardado: true, totalRetiros: 0, totalDepositos: 0, createdAt: new Date() }],
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
      getRepository: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        ShiftsService,
        {
          provide: CostsService,
          useValue: {
            createJustifiable: jest.fn((data: any) => {
              if (failMermaWrite) return Promise.reject(new Error('fallo simulado al registrar la merma'));
              mermas.push(data);
              return Promise.resolve(data);
            }),
          },
        },
        { provide: AppointmentsService, useValue: {} },
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
        { provide: getRepositoryToken(Shift), useValue: shiftsRepo },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn(({ where }: any) => productLookup(where)) } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(({ where }: any) => Promise.resolve(insumos.get(where.id) ? { ...insumos.get(where.id) } : null)), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn(() => Promise.resolve(null)) } },
        { provide: DataSource, useValue: dataSource },
        { provide: InsumoAlertsService, useValue: { upsert: jest.fn() } },
        { provide: TenantSettingsService, useValue: { hasPosCapability: jest.fn((_t: string, cap: string) => Promise.resolve(!!caps[cap])), getPoliticaDevoluciones: jest.fn((t: string) => Promise.resolve(politicas[t] ?? 'SOLO_GERENTE')) } },
      ],
    }).compile();
    sales = module.get(SalesService);
    shiftsService = module.get(ShiftsService);
  });

  const cerrarTurno = async (id = 'turno-1') => {
    await shiftsService.closeShift(id, { efectivoContado: 0 } as any, TENANT_A);
    return shiftUpdates.filter((u) => u.id === id).pop()!.patch;
  };

  // ── stock ───────────────────────────────────────────────────────────────────────────────
  describe('stock', () => {
    it('ítems sin cocina: el stock vuelve por la cadena de Costos y queda el movimiento ENTRADA_DEVOLUCION', async () => {
      const v = await crearPagada(); // 2 tacos: stock 98
      expect(stock()).toBe(98);

      const dev: any = await sales.returnSale(v.id, { motivo: 'cliente se arrepintió' }, TENANT_A, GERENTE);

      expect(stock()).toBe(100);
      expect(movimientos.filter((m) => m.tipo === 'ENTRADA_DEVOLUCION')).toEqual([
        expect.objectContaining({ cantidad: 2, stockResultante: 100, referencia: `${v.folio}-DEV`, insumoId: 'ins-1' }),
      ]);
      expect(ventas.get(v.id).status).toBe('DEVUELTA');
      expect(dev.status).toBe('DEVOLUCION');
      expect(dev.referencia).toBe(v.folio);
      expect(dev.notas).toContain('cliente se arrepintió');
      expect(mermas).toHaveLength(0);
    });

    it('ítem que ya salió a cocina: NO regresa su stock y se registra merma (MERMAS_FALTANTES); lo demás sí regresa', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearPagada({
        items: [
          { productoId: 'p-simple', nombre: 'Taco', cantidad: 1, precioUnitario: 50, descuento: 0, subtotal: 50 },
          { productoId: 'p-cocina-ins', nombre: 'Tacos al pastor', cantidad: 2, precioUnitario: 60, descuento: 0, subtotal: 120 },
        ],
      });
      expect(stock()).toBe(97); // 100 − 1 − 2

      await sales.returnSale(v.id, { motivo: 'queja' }, TENANT_A, GERENTE);

      expect(stock()).toBe(98); // solo regresó el taco sin cocina: 97 + 1
      expect(mermas).toHaveLength(1);
      expect(mermas[0]).toEqual(expect.objectContaining({ categoria: 'MERMAS_FALTANTES', monto: 10, tenantId: TENANT_A })); // 2 × $5
      expect(mermas[0].detalles.items).toEqual([expect.objectContaining({ productoId: 'p-cocina-ins', cantidad: 2 })]);
      expect(notas.every((n) => n.estado === 'CANCELADA')).toBe(true); // nada pendiente en cocina
    });
  });

  // ── validaciones ────────────────────────────────────────────────────────────────────────
  describe('reglas', () => {
    it('segunda devolución de la misma venta: 400, sin más stock ni otra fila de devolución', async () => {
      const v = await crearPagada();
      await sales.returnSale(v.id, { motivo: 'uno' }, TENANT_A, GERENTE);
      const err: any = await sales.returnSale(v.id, { motivo: 'dos' }, TENANT_A, GERENTE).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('Esta venta ya fue devuelta.');
      expect(stock()).toBe(100);
      expect(devoluciones()).toHaveLength(1);
    });

    it('sin turno abierto: 400 con mensaje claro y no cambia nada', async () => {
      const v = await crearPagada();
      turnos.get('turno-1').status = 'CERRADO';
      const err: any = await sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getStatus()).toBe(400);
      expect(err.message).toBe('No hay un turno abierto en esta sucursal: abre turno antes de devolver una venta.');
      expect(ventas.get(v.id).status).toBe('PAGADA');
      expect(stock()).toBe(98);
      expect(devoluciones()).toHaveLength(0);
    });

    it('ignora items y montoDevolucion del request: todo sale de la venta original', async () => {
      const v = await crearPagada(); // total 100
      const dev: any = await sales.returnSale(v.id, { motivo: 'x', montoDevolucion: 1, items: [] } as any, TENANT_A, GERENTE);
      expect(Number(dev.total)).toBe(100);
      expect(dev.items).toHaveLength(1);
      expect(stock()).toBe(100);
    });

    it('motivo requerido: 400', async () => {
      const v = await crearPagada();
      await expect(sales.returnSale(v.id, { motivo: '  ' }, TENANT_A, GERENTE)).rejects.toThrow(BadRequestException);
      await expect(sales.returnSale(v.id, undefined, TENANT_A, GERENTE)).rejects.toThrow(BadRequestException);
      expect(ventas.get(v.id).status).toBe('PAGADA');
    });

    it('solo ventas PAGADA: una ABIERTA, una CANCELADA, una devolución y una fila -DEV vieja (negativa) dan 400', async () => {
      const abierta = await sales.create({ items: [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 1, precioUnitario: 50, descuento: 0, subtotal: 50 }], subtotal: 50, descuento: 0, impuestos: 0, total: 50, cajero: 'c', turnoId: 'turno-1', sucursalId: 'sucursal-A', tenantId: TENANT_A, folio: 'ABI' } as any);
      await expect(sales.returnSale(abierta.id, { motivo: 'x' }, TENANT_A, GERENTE)).rejects.toThrow('Solo se puede devolver ventas pagadas');
      ventas.set('canc', { id: 'canc', tenantId: TENANT_A, status: 'CANCELADA', total: 10 });
      await expect(sales.returnSale('canc', { motivo: 'x' }, TENANT_A, GERENTE)).rejects.toThrow(BadRequestException);
      ventas.set('viejo-dev', { id: 'viejo-dev', tenantId: TENANT_A, status: 'PAGADA', total: -50, folio: 'X-DEV', sucursalId: 'sucursal-A' });
      await expect(sales.returnSale('viejo-dev', { motivo: 'x' }, TENANT_A, GERENTE)).rejects.toThrow('Solo se puede devolver ventas pagadas');
    });
  });

  // ── aislamiento de tenant ───────────────────────────────────────────────────────────────
  describe('aislamiento de tenant', () => {
    it('otro tenant: 404 y no toca stock, venta ni caja', async () => {
      const v = await crearPagada();
      await expect(sales.returnSale(v.id, { motivo: 'x' }, TENANT_B, GERENTE)).rejects.toThrow(NotFoundException);
      expect(ventas.get(v.id).status).toBe('PAGADA');
      expect(stock()).toBe(98);
      expect(devoluciones()).toHaveLength(0);
    });

    it('sin tenantId: 403 (nunca se busca la venta solo por id)', async () => {
      const v = await crearPagada();
      await expect(sales.returnSale(v.id, { motivo: 'x' }, undefined, GERENTE)).rejects.toThrow(ForbiddenException);
      expect(ventas.get(v.id).status).toBe('PAGADA');
    });

    it('el turno de otro tenant no sirve: sin turno abierto PROPIO da 400', async () => {
      const v = await crearPagada();
      turnos.get('turno-1').tenantId = TENANT_B;
      await expect(sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE)).rejects.toThrow('No hay un turno abierto');
    });
  });

  // ── rollback ────────────────────────────────────────────────────────────────────────────
  describe('transaccionalidad', () => {
    it('falla al reponer stock: rollback completo (venta sigue PAGADA, sin devolución, sin movimientos)', async () => {
      const v = await crearPagada();
      failRestoreOn = 'ins-1';
      await expect(sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE)).rejects.toThrow('fallo simulado');
      expect(ventas.get(v.id).status).toBe('PAGADA');
      expect(devoluciones()).toHaveLength(0);
      expect(stock()).toBe(98);
      expect(movimientos.filter((m) => m.tipo === 'ENTRADA_DEVOLUCION')).toHaveLength(0);
    });

    it('falla al registrar la merma: se revierte también el stock ya devuelto y las notas siguen pendientes', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearPagada({
        items: [
          { productoId: 'p-simple', nombre: 'Taco', cantidad: 1, precioUnitario: 50, descuento: 0, subtotal: 50 },
          { productoId: 'p-cocina-ins', nombre: 'Tacos al pastor', cantidad: 2, precioUnitario: 60, descuento: 0, subtotal: 120 },
        ],
      });
      failMermaWrite = true;
      await expect(sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE)).rejects.toThrow('fallo simulado');
      expect(stock()).toBe(97);
      expect(ventas.get(v.id).status).toBe('PAGADA');
      expect(devoluciones()).toHaveLength(0);
      expect(notas.every((n) => n.estado === 'PENDIENTE')).toBe(true);
    });
  });

  // ── corte Z ─────────────────────────────────────────────────────────────────────────────
  describe('corte Z (ShiftsService.closeShift)', () => {
    it('pago mixto: la devolución resta efectivo, tarjeta y transferencia según las formasPago; totalVentas queda bruto y la devolución cuenta UNA vez', async () => {
      const mixta = await crearPagada({
        formasPago: [
          { forma: 'EFECTIVO', monto: 60 },
          { forma: 'TARJETA', monto: 30 },
          { forma: 'TRANSFERENCIA', monto: 10 },
        ],
      });
      await crearPagada({ formaPago: 'EFECTIVO', items: [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 1, precioUnitario: 50, descuento: 0, subtotal: 50 }] });

      await sales.returnSale(mixta.id, { motivo: 'x' }, TENANT_A, GERENTE);
      const cierre = await cerrarTurno();

      expect(cierre.totalVentas).toBe(150); // bruto: 100 (mixta) + 50, sin restar la devolución
      expect(cierre.totalEfectivo).toBe(50); // 60 + 50 − 60
      expect(cierre.totalTarjeta).toBe(0); // 30 − 30
      expect(cierre.totalTransferencia).toBe(0); // 10 − 10
      expect(cierre.totalDevoluciones).toBe(100); // una sola vez (la fila -DEV vieja ya no existe)
    });

    it('un solo pago con tarjeta: la devolución resta de tarjeta y no toca el efectivo', async () => {
      const v = await crearPagada({ formaPago: 'TARJETA' });
      await sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE);
      const cierre = await cerrarTurno();
      expect(cierre).toEqual(expect.objectContaining({ totalVentas: 100, totalEfectivo: 0, totalTarjeta: 0, totalDevoluciones: 100 }));
    });

    it('venta de un turno ya cerrado, devuelta hoy: el turno actual refleja el reembolso; el anterior no se reabre', async () => {
      turnos.set('turno-0', { id: 'turno-0', tenantId: TENANT_A, sucursalId: 'sucursal-A', cajero: 'cajero-1', status: 'CERRADO', createdAt: new Date(0) });
      const v = await crearPagada({ turnoId: 'turno-0', formaPago: 'EFECTIVO' });
      await sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE);

      expect(devoluciones()[0].turnoId).toBe('turno-1'); // atribuida al turno abierto actual
      const cierre = await cerrarTurno('turno-1');
      expect(cierre).toEqual(expect.objectContaining({ totalVentas: 0, totalEfectivo: -100, totalDevoluciones: 100 }));
    });

    it('cuenta abierta de mesa cancelada sin cobro sigue sin contar como devolución', async () => {
      ventas.set('cancelada-mesa', { id: 'cancelada-mesa', tenantId: TENANT_A, status: 'CANCELADA', turnoId: 'turno-1', total: '70', tableId: 'mesa-1', formasPago: [], formaPago: null });
      const v = await crearPagada({ formaPago: 'EFECTIVO' });
      await sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, GERENTE);
      const cierre = await cerrarTurno();
      expect(cierre.totalDevoluciones).toBe(100); // solo la devolución real, no los $70 de la cuenta sin cobro
    });
  });

  // ── política de devoluciones por tenant ─────────────────────────────────────────────────
  describe('política de devoluciones (politicaDevoluciones)', () => {
    const intacta = (id: string) => {
      expect(ventas.get(id).status).toBe('PAGADA');
      expect(stock()).toBe(98);
      expect(devoluciones()).toHaveLength(0);
    };

    it('tenant sin configurar: usa SOLO_GERENTE → un cajero recibe 403 y no cambia nada', async () => {
      const v = await crearPagada();
      const err: any = await sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, CAJERO).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getStatus()).toBe(403);
      expect(err.message).toContain('solo permite devolver a un gerente o administrador');
      intacta(v.id);
    });

    it('SOLO_GERENTE explícito: el gerente y el admin pasan; sin usuario o sin rol, 403', async () => {
      politicas[TENANT_A] = 'SOLO_GERENTE';
      const v1 = await crearPagada();
      await expect(sales.returnSale(v1.id, { motivo: 'x' }, TENANT_A, GERENTE)).resolves.toBeDefined();
      const v2 = await crearPagada();
      await expect(sales.returnSale(v2.id, { motivo: 'x' }, TENANT_A, ADMIN)).resolves.toBeDefined();
      const v3 = await crearPagada();
      await expect(sales.returnSale(v3.id, { motivo: 'x' }, TENANT_A, undefined)).rejects.toThrow(ForbiddenException);
      await expect(sales.returnSale(v3.id, { motivo: 'x' }, TENANT_A, { id: 'u', email: 'a@b.c' })).rejects.toThrow(ForbiddenException);
      await expect(sales.returnSale(v3.id, { motivo: 'x' }, TENANT_A, { id: 'u', roleCode: 'MESERO' })).rejects.toThrow(ForbiddenException);
      expect(ventas.get(v3.id).status).toBe('PAGADA');
    });

    it('CAJERO_LIBRE: un cajero puede devolver', async () => {
      politicas[TENANT_A] = 'CAJERO_LIBRE';
      const v = await crearPagada();
      const dev: any = await sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, CAJERO);
      expect(dev.status).toBe('DEVOLUCION');
      expect(stock()).toBe(100);
    });

    it('aislamiento: la política de OTRO tenant no aplica — B en CAJERO_LIBRE no abre las devoluciones de A', async () => {
      politicas[TENANT_B] = 'CAJERO_LIBRE';
      const v = await crearPagada(); // tenant A, sin configurar
      await expect(sales.returnSale(v.id, { motivo: 'x' }, TENANT_A, CAJERO)).rejects.toThrow(ForbiddenException);
      intacta(v.id);
    });

    it('la política se valida ANTES de leer la venta: un cajero no averigua si una venta existe', async () => {
      await expect(sales.returnSale('no-existe', { motivo: 'x' }, TENANT_A, CAJERO)).rejects.toThrow(ForbiddenException);
    });

    it('queda registrado quién devolvió: en las notas y en formasPago[].autorizadoPor de la DEVOLUCION', async () => {
      const mixta = await crearPagada({ formasPago: [{ forma: 'EFECTIVO', monto: 60 }, { forma: 'TARJETA', monto: 40 }] });
      const dev: any = await sales.returnSale(mixta.id, { motivo: 'queja' }, TENANT_A, GERENTE);
      expect(dev.notas).toBe(`Devolución de venta ${mixta.folio}. Motivo: queja. Devolvió: gerente@demo.com (GERENTE)`);
      expect(dev.formasPago.map((p: any) => p.autorizadoPor)).toEqual(['gerente@demo.com', 'gerente@demo.com']);
    });

    it('getPoliticaDevolucionesParaUsuario(): informa la política y si ese usuario puede devolver', async () => {
      await expect(sales.getPoliticaDevolucionesParaUsuario(TENANT_A, CAJERO)).resolves.toEqual({ politicaDevoluciones: 'SOLO_GERENTE', puedeDevolver: false });
      await expect(sales.getPoliticaDevolucionesParaUsuario(TENANT_A, GERENTE)).resolves.toEqual({ politicaDevoluciones: 'SOLO_GERENTE', puedeDevolver: true });
      politicas[TENANT_A] = 'CAJERO_LIBRE';
      await expect(sales.getPoliticaDevolucionesParaUsuario(TENANT_A, CAJERO)).resolves.toEqual({ politicaDevoluciones: 'CAJERO_LIBRE', puedeDevolver: true });
      await expect(sales.getPoliticaDevolucionesParaUsuario(undefined, CAJERO)).rejects.toThrow(ForbiddenException);
    });
  });
});
