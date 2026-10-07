import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
import { Cita } from '../appointments/entities/cita.entity';
import { Patient } from '../patients/entities/patient.entity';

// POS flexible, capacidad mesas_cuenta_abierta (toca dinero y inventario directamente). Se prueba
// contra SalesService, ShiftsService y AppointmentsService REALES; solo se simula la base de datos
// con una "BD" en memoria que respeta los filtros por tenant, ignora nada, y hace rollback de
// verdad si una transacción lanza — para que un cambio en saldo, split, lock o aislamiento rompa
// estas pruebas.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

type Caps = Record<string, boolean>;

describe('SalesService — capacidad mesas_cuenta_abierta', () => {
  let service: SalesService;
  let caps: Caps;
  let sales: Map<string, any>;
  let tables: Map<string, any>;
  let citas: Map<string, any>;
  let insumos: Map<string, any>;
  let notas: any[];
  let mermas: any[];
  let movimientos: any[];
  let failRestoreOn: string | null;
  let failMermaWrite: boolean;
  let managerFindOne: jest.Mock;
  let stockPolicy: string | null;
  let nextId: number;

  // ── mini-BD ─────────────────────────────────────────────────────────────────────────────
  const matches = (row: any, where: any) =>
    Object.entries(where || {}).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && '_type' in v) return row[k] !== null && row[k] !== undefined; // Not(IsNull())
      return row[k] === v;
    });
  const snapshot = () => ({
    sales: new Map([...sales].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])),
    tables: new Map([...tables].map(([k, v]) => [k, { ...v }])),
    citas: new Map([...citas].map(([k, v]) => [k, { ...v }])),
    insumos: new Map([...insumos].map(([k, v]) => [k, { ...v }])),
    notas: notas.map((n) => ({ ...n })),
    mermas: mermas.map((m) => JSON.parse(JSON.stringify(m))),
    movimientos: movimientos.map((m) => ({ ...m })),
  });
  const restore = (s: ReturnType<typeof snapshot>) => {
    sales = s.sales; tables = s.tables; citas = s.citas; insumos = s.insumos; notas = s.notas;
    mermas = s.mermas; movimientos = s.movimientos;
  };
  const mapFor = (entity: any): Map<string, any> | null =>
    entity === Sale ? sales : entity === Table ? tables : entity === Cita ? citas : entity === Insumo ? insumos : null;

  const PRODUCTS: Record<string, any> = {
    'p-simple': { id: 'p-simple', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Taco', esServicio: false },
    'p-servicio': { id: 'p-servicio', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Consulta', esServicio: true },
    'p-cocina': { id: 'p-cocina', type: 'SIMPLE', insumoId: null, recipeId: null, tenantId: TENANT_A, name: 'Hamburguesa', esServicio: false, estacionPreparacion: 'COCINA' },
    'p-simple-2': { id: 'p-simple-2', type: 'SIMPLE', insumoId: 'ins-2', recipeId: null, tenantId: TENANT_A, name: 'Refresco', esServicio: false },
    // sale a cocina Y tiene insumo: permite ver a la vez la nota emitida y el efecto en stock
    'p-cocina-ins': { id: 'p-cocina-ins', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_A, name: 'Tacos al pastor', esServicio: false, estacionPreparacion: 'COCINA' },
    'p-B': { id: 'p-B', type: 'SIMPLE', insumoId: 'ins-1', recipeId: null, tenantId: TENANT_B, name: 'Ajeno', esServicio: false },
  };
  // Precio de catálogo: en una cuenta abierta el servidor pone precio e IVA (no el cliente).
  const PRECIO: Record<string, number> = { 'p-simple': 50, 'p-servicio': 100, 'p-cocina': 80, 'p-simple-2': 20, 'p-cocina-ins': 60, 'p-B': 50 };
  for (const p of Object.values(PRODUCTS)) p.price = PRECIO[p.id];
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
          sales.set(row.id, row);
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
      findOne: (managerFindOne = jest.fn((entity: any, opts: any) => {
        if (entity === Product) return productLookup(opts.where);
        const m = mapFor(entity);
        if (!m) return Promise.resolve(null);
        const row = [...m.values()].find((r) => matches(r, opts.where));
        return Promise.resolve(row ? JSON.parse(JSON.stringify(row)) : null);
      })),
      update: jest.fn((entity: any, criteria: any, patch: any) => {
        if (entity === NotaCocina) {
          for (const n of notas) if (matches(n, criteria)) Object.assign(n, patch);
          return Promise.resolve(undefined);
        }
        // Inyección de fallo: reponer stock de un insumo concreto falla (simula un error a mitad de la cancelación)
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
      getRepository: jest.fn((entity: any) => ({
        findOne: ({ where }: any) => {
          const row = [...mapFor(entity)!.values()].find((r) => matches(r, where));
          return Promise.resolve(row ? { ...row } : null);
        },
        update: (id: string, patch: any) => {
          Object.assign(mapFor(entity)!.get(id), patch);
          return Promise.resolve(undefined);
        },
      })),
    };
  }

  // ── fixtures ────────────────────────────────────────────────────────────────────────────
  async function crearVenta(extra: Record<string, any> = {}, items: any[] = [{ productoId: 'p-simple', nombre: 'Taco', cantidad: 2, precioUnitario: 50, descuento: 0, subtotal: 100 }]) {
    const total = items.reduce((s, i) => s + i.subtotal, 0);
    const creada: any = await service.create({
      items: items as any,
      subtotal: total, descuento: 0, impuestos: 0, total,
      cajero: 'cajero-1', turnoId: 'turno-1', sucursalId: 'sucursal-A', tenantId: TENANT_A,
      tableId: 'mesa-1',
      folio: `VTA-${++nextId}`,
      ...extra,
    } as any);
    // create() recalcula precio e IVA en el servidor. Estas pruebas son de cobro / quitar / dividir y necesitan importes
    // exactos y raros (centavos, IVA 8%, descuento global): se fijan a mano sobre la fila ya creada. Lo que crea el
    // servidor (precio, IVA) se prueba en su propio bloque más abajo.
    const fila = sales.get(creada.id);
    if (!fila || extra.tableId === null || !creada.tableId) return creada;
    fila.items = fila.items.map((it: any, i: number) => ({ ...it, precioUnitario: items[i].precioUnitario, descuento: items[i].descuento ?? 0, subtotal: items[i].subtotal }));
    Object.assign(fila, { subtotal: total, descuento: extra.descuento ?? 0, impuestos: extra.impuestos ?? 0, total: extra.total ?? total });
    return { ...fila };
  }

  beforeEach(async () => {
    caps = { mesas_cuenta_abierta: true };
    stockPolicy = null;
    nextId = 0;
    sales = new Map();
    tables = new Map([
      ['mesa-1', { id: 'mesa-1', tenantId: TENANT_A, number: 1, status: 'AVAILABLE', isActive: true }],
      ['mesa-2', { id: 'mesa-2', tenantId: TENANT_A, number: 2, status: 'AVAILABLE', isActive: true }],
      ['mesa-inactiva', { id: 'mesa-inactiva', tenantId: TENANT_A, number: 3, status: 'AVAILABLE', isActive: false }],
      ['mesa-B', { id: 'mesa-B', tenantId: TENANT_B, number: 1, status: 'AVAILABLE', isActive: true }],
    ]);
    citas = new Map([['cita-1', { id: 'cita-1', tenantId: TENANT_A, estado: 'PENDIENTE' }]]);
    insumos = new Map([
      ['ins-1', { id: 'ins-1', nombre: 'Tortilla', isActive: true, stockActual: 100, stockMinimo: 0, costoUnitario: 5 }],
      ['ins-2', { id: 'ins-2', nombre: 'Refresco', isActive: true, stockActual: 50, stockMinimo: 0, costoUnitario: 10 }],
    ]);
    notas = [];
    mermas = [];
    movimientos = [];
    failRestoreOn = null;
    failMermaWrite = false;

    const salesRepo = {
      findOne: jest.fn(({ where }: any) => {
        const row = [...sales.values()].find((r) => matches(r, where));
        return Promise.resolve(row ? JSON.parse(JSON.stringify(row)) : null);
      }),
      find: jest.fn(({ where }: any) => Promise.resolve([...sales.values()].filter((r) => matches(r, where)).map((r) => JSON.parse(JSON.stringify(r))))),
      update: jest.fn((id: string, patch: any) => { Object.assign(sales.get(id), patch); return Promise.resolve(undefined); }),
      createQueryBuilder: jest.fn(),
    };
    const citasRepo = {
      findOne: jest.fn(({ where }: any) => {
        const c = citas.get(where.id);
        return Promise.resolve(c && (!where.tenantId || c.tenantId === where.tenantId) ? { ...c } : null);
      }),
      update: jest.fn((id: string, patch: any) => { Object.assign(citas.get(id), patch); return Promise.resolve(undefined); }),
      createQueryBuilder: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const snap = snapshot();
        try {
          return await cb(buildManager());
        } catch (e) {
          restore(snap); // rollback real: nada de lo escrito dentro de la transacción sobrevive
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
        AppointmentsService,
        // Merma por la vía de Costos: el fake solo registra la fila; el rollback de la transacción
        // simulada la descarta igual que descartaría la fila real.
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
        { provide: getRepositoryToken(Cita), useValue: citasRepo },
        { provide: getRepositoryToken(Patient), useValue: {} },
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn(({ where }: any) => productLookup(where)) } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(({ where }: any) => Promise.resolve(insumos.get(where.id) ? { ...insumos.get(where.id) } : null)), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn(() => Promise.resolve(stockPolicy ? { stockPolicy } : null)) } },
        { provide: DataSource, useValue: dataSource },
        { provide: InsumoAlertsService, useValue: { upsert: jest.fn() } },
        { provide: TenantSettingsService, useValue: { hasPosCapability: jest.fn((_t: string, cap: string) => Promise.resolve(!!caps[cap])) } },
      ],
    }).compile();
    service = module.get(SalesService);
  });

  const mesa = (id = 'mesa-1') => tables.get(id).status;
  const venta = (id: string) => sales.get(id);

  // ── apertura ────────────────────────────────────────────────────────────────────────────
  describe('abrir cuenta (create con tableId)', () => {
    it('capacidad ACTIVA: nace ABIERTA, ocupa la mesa y descuenta inventario como una venta normal', async () => {
      const v = await crearVenta();
      expect(v.status).toBe('ABIERTA');
      expect(v.tableId).toBe('mesa-1');
      expect(mesa()).toBe('OCCUPIED');
      expect(insumos.get('ins-1').stockActual).toBe(98);
    });

    it('una sola cuenta abierta por mesa: la segunda recibe 409 con el folio de la primera y no deja rastro', async () => {
      const primera = await crearVenta();
      await expect(crearVenta()).rejects.toThrow(ConflictException);
      await expect(crearVenta({ folio: 'OTRA' })).rejects.toThrow(`folio ${primera.folio}`);
      expect(sales.size).toBe(1);
      expect(insumos.get('ins-1').stockActual).toBe(98); // el rollback devolvió el stock del intento fallido
    });

    it('mesa de OTRO tenant o inactiva: 404, sin crear venta', async () => {
      await expect(crearVenta({ tableId: 'mesa-B' })).rejects.toThrow(NotFoundException);
      await expect(crearVenta({ tableId: 'mesa-inactiva' })).rejects.toThrow(NotFoundException);
      await expect(crearVenta({ tableId: 'no-existe' })).rejects.toThrow(NotFoundException);
      expect(sales.size).toBe(0);
    });

    it('capacidad INACTIVA: tableId se guarda como siempre y la mesa NO se toca (ni hay límite de cuentas)', async () => {
      caps.mesas_cuenta_abierta = false;
      await crearVenta();
      await expect(crearVenta({ folio: 'OTRA' })).resolves.toBeDefined();
      expect(mesa()).toBe('AVAILABLE');
      expect(sales.size).toBe(2);
    });

    it('venta que nace PAGADA con tableId: no ocupa la mesa ni choca con una cuenta abierta', async () => {
      await crearVenta();
      const pagada = await crearVenta({ folio: 'PAGADA-1', formasPago: [{ forma: 'EFECTIVO', monto: 100 }] });
      expect(pagada.status).toBe('PAGADA');
      expect(mesa()).toBe('OCCUPIED'); // sigue por la cuenta abierta
    });
  });

  // ── agregar ítems ───────────────────────────────────────────────────────────────────────
  describe('agregarItems()', () => {
    const nuevo = (extra: Record<string, any> = {}) => ({ productoId: 'p-simple', nombre: 'Taco', cantidad: 3, precioUnitario: 50, descuento: 0, subtotal: 150, ...extra });

    it('suma el ítem, recalcula subtotal/total/costoReal y descuenta SOLO el inventario de lo nuevo', async () => {
      const v = await crearVenta(); // 2 tacos: stock 98, costoReal 10
      const r: any = await service.agregarItems(v.id, { items: [nuevo()], impuestos: 24 }, TENANT_A);

      expect(r.items).toHaveLength(2);
      expect(Number(r.subtotal)).toBe(250);
      expect(Number(r.impuestos)).toBe(24);
      expect(Number(r.total)).toBe(274);
      expect(Number(r.costoReal)).toBe(25); // 10 + 3 × 5
      expect(insumos.get('ins-1').stockActual).toBe(95); // 98 − 3
      expect(r.status).toBe('ABIERTA');
    });

    it('conserva los ítems anteriores en su posición (los índices de "dividir por ítems" siguen válidos)', async () => {
      const v = await crearVenta();
      const r: any = await service.agregarItems(v.id, { items: [nuevo({ productoId: 'p-cocina', nombre: 'Hamburguesa', cantidad: 1, subtotal: 80 })] }, TENANT_A);
      expect(r.items[0].nombre).toBe('Taco');
      expect(r.items[1].nombre).toBe('Hamburguesa');
    });

    it('reutiliza venta_de_servicio: un ítem de servicio agregado NO descuenta inventario', async () => {
      caps.venta_de_servicio = true;
      const v = await crearVenta();
      await service.agregarItems(v.id, { items: [nuevo({ productoId: 'p-servicio', cantidad: 4, subtotal: 400 })] }, TENANT_A);
      expect(insumos.get('ins-1').stockActual).toBe(98);
    });

    it('reutiliza notas_cocina_barra: genera nota SOLO para el ítem nuevo con estación', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [{ productoId: 'p-cocina', nombre: 'Hamburguesa', cantidad: 1, precioUnitario: 80, descuento: 0, subtotal: 80 }]);
      expect(notas).toHaveLength(1); // la de la apertura
      await service.agregarItems(v.id, { items: [nuevo({ productoId: 'p-cocina', nombre: 'Hamburguesa', cantidad: 2, subtotal: 160 })] }, TENANT_A);
      expect(notas).toHaveLength(2);
      expect(notas[1]).toEqual(expect.objectContaining({ cantidad: 2, estacion: 'COCINA', saleId: v.id }));
    });

    it('reutiliza stockPolicy BLOQUEAR: sin stock suficiente se rechaza y la cuenta no cambia', async () => {
      stockPolicy = 'BLOQUEAR';
      const v = await crearVenta();
      await expect(service.agregarItems(v.id, { items: [nuevo({ cantidad: 500, subtotal: 25000 })] }, TENANT_A)).rejects.toThrow('Stock insuficiente');
      expect(venta(v.id).items).toHaveLength(1);
      expect(insumos.get('ins-1').stockActual).toBe(98);
    });

    it('cuenta de OTRO tenant: 404 y no se toca', async () => {
      const v = await crearVenta();
      await expect(service.agregarItems(v.id, { items: [nuevo()] }, TENANT_B)).rejects.toThrow(NotFoundException);
      expect(venta(v.id).items).toHaveLength(1);
    });

    it('producto de OTRO tenant: 400 y no descuenta su inventario', async () => {
      const v = await crearVenta();
      await expect(service.agregarItems(v.id, { items: [nuevo({ productoId: 'p-B' })] }, TENANT_A)).rejects.toThrow(BadRequestException);
      expect(insumos.get('ins-1').stockActual).toBe(98);
    });

    it('cuenta ya PAGADA: 400', async () => {
      const v = await crearVenta();
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_A);
      await expect(service.agregarItems(v.id, { items: [nuevo()] }, TENANT_A)).rejects.toThrow('cuenta abierta');
    });

    it('capacidad INACTIVA: 403; items vacíos o inválidos: 400', async () => {
      const v = await crearVenta();
      await expect(service.agregarItems(v.id, { items: [] }, TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(service.agregarItems(v.id, { items: [{ productoId: 'p-simple', cantidad: 0 }] }, TENANT_A)).rejects.toThrow(BadRequestException);
      caps.mesas_cuenta_abierta = false;
      await expect(service.agregarItems(v.id, { items: [nuevo()] }, TENANT_A)).rejects.toThrow(ForbiddenException);
    });

    it('lee la venta con lock de escritura (dos cajeros a la vez no calculan sobre datos viejos)', async () => {
      const v = await crearVenta();
      managerFindOne.mockClear();
      await service.agregarItems(v.id, { items: [nuevo()] }, TENANT_A);
      expect(managerFindOne).toHaveBeenCalledWith(Sale, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    });
  });

  // ── cobro total / dividido ──────────────────────────────────────────────────────────────
  describe('cobrarCuenta()', () => {
    it('cobro total (sin monto): PAGADA, saldo 0, libera la mesa', async () => {
      const v = await crearVenta();
      const r: any = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', montoRecibido: 200, cambio: 100 }, TENANT_A);

      expect(r.cerrada).toBe(true);
      expect(r.saldoPendiente).toBe(0);
      expect(r.sale.status).toBe('PAGADA');
      expect(r.sale.formaPago).toBe('EFECTIVO');
      expect(r.sale.formasPago).toEqual([expect.objectContaining({ forma: 'EFECTIVO', monto: 100 })]);
      expect(Number(r.sale.montoRecibido)).toBe(200);
      expect(Number(r.sale.cambio)).toBe(100);
      expect(mesa()).toBe('AVAILABLE');
    });

    it('dividir entre 3 ($100): 33.33 + 33.33 y el último paga el resto exacto (33.34) — suma exacta, sin perder centavos', async () => {
      const v = await crearVenta();
      const r1: any = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 33.33 }, TENANT_A);
      expect(r1.cerrada).toBe(false);
      expect(r1.saldoPendiente).toBe(66.67);
      expect(r1.sale.status).toBe('ABIERTA');
      expect(mesa()).toBe('OCCUPIED'); // sigue ocupada mientras haya saldo

      await service.cobrarCuenta(v.id, { formaPago: 'TARJETA', monto: 33.33 }, TENANT_A);
      const r3: any = await service.cobrarCuenta(v.id, { formaPago: 'TRANSFERENCIA' }, TENANT_A); // omite monto → paga el resto

      expect(r3.cerrada).toBe(true);
      expect(r3.sale.formasPago.map((p: any) => p.monto)).toEqual([33.33, 33.33, 33.34]);
      expect(r3.sale.formasPago.reduce((s: number, p: any) => s + p.monto, 0)).toBeCloseTo(100, 10);
      expect(mesa()).toBe('AVAILABLE');
    });

    it('dividir por ítems: cada grupo paga su parte proporcional (con impuestos) y el último absorbe el redondeo', async () => {
      const v = await crearVenta({ impuestos: 16, total: 116 }, [
        { productoId: 'p-simple', nombre: 'A', cantidad: 1, precioUnitario: 60, descuento: 0, subtotal: 60 },
        { productoId: 'p-simple', nombre: 'B', cantidad: 1, precioUnitario: 40, descuento: 0, subtotal: 40 },
      ]);
      // subtotal 100, total 116 → factor 1.16: ítem 0 = 69.60; ítem 1 = resto = 46.40
      const r1: any = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A);
      expect(r1.sale.formasPago[0]).toEqual(expect.objectContaining({ monto: 69.6, itemIndexes: [0] }));
      expect(r1.saldoPendiente).toBe(46.4);
      expect(r1.cerrada).toBe(false);

      const r2: any = await service.cobrarCuenta(v.id, { formaPago: 'TARJETA', itemIndexes: [1] }, TENANT_A);
      expect(r2.sale.formasPago[1].monto).toBe(46.4);
      expect(r2.cerrada).toBe(true);
    });

    it('un ítem no se puede cobrar dos veces', async () => {
      const v = await crearVenta({}, [
        { productoId: 'p-simple', nombre: 'A', cantidad: 1, precioUnitario: 60, descuento: 0, subtotal: 60 },
        { productoId: 'p-simple', nombre: 'B', cantidad: 1, precioUnitario: 40, descuento: 0, subtotal: 40 },
      ]);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A);
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A)).rejects.toThrow('ya fue cobrado');
      expect(venta(v.id).formasPago).toHaveLength(1);
    });

    it('un monto mayor al saldo se rechaza y no cambia nada; tampoco monto cero o negativo', async () => {
      const v = await crearVenta();
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 60 }, TENANT_A);
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 40.01 }, TENANT_A)).rejects.toThrow('excede el saldo');
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 0 }, TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: -5 }, TENANT_A)).rejects.toThrow(BadRequestException);
      expect(venta(v.id).formasPago).toHaveLength(1);
      expect(venta(v.id).status).toBe('ABIERTA');
    });

    it('validaciones: monto+itemIndexes juntos, forma inválida, índice fuera de rango', async () => {
      const v = await crearVenta();
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 10, itemIndexes: [0] }, TENANT_A)).rejects.toThrow('no ambos');
      await expect(service.cobrarCuenta(v.id, { formaPago: 'BITCOIN' }, TENANT_A)).rejects.toThrow('formaPago inválida');
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [7] }, TENANT_A)).rejects.toThrow('no existe');
    });

    it('agregar ítems después de un cobro parcial sube el saldo y el cobro final lo liquida todo', async () => {
      const v2 = await crearVenta({ tableId: 'mesa-2' }); // total 100
      await service.cobrarCuenta(v2.id, { formaPago: 'EFECTIVO', monto: 40 }, TENANT_A);
      // el servidor pone precio de catálogo ($80) e IVA (16%): +92.80
      await service.agregarItems(v2.id, { items: [{ productoId: 'p-cocina', nombre: 'Postre', cantidad: 1, precioUnitario: 30, descuento: 0, subtotal: 30 }] }, TENANT_A);
      const r: any = await service.cobrarCuenta(v2.id, { formaPago: 'TARJETA' }, TENANT_A);
      expect(r.sale.formasPago.map((p: any) => p.monto)).toEqual([40, 152.8]); // total 192.80
      expect(r.cerrada).toBe(true);
    });

    it('al cerrarse completa la cita ligada; un cobro parcial NO la completa', async () => {
      caps.ligar_venta_a_cita = true;
      const v = await crearVenta({ citaId: 'cita-1' });
      expect(venta(v.id).citaId).toBe('cita-1');

      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 50 }, TENANT_A);
      expect(citas.get('cita-1').estado).toBe('PENDIENTE');

      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_A);
      expect(citas.get('cita-1').estado).toBe('COMPLETADA');
    });

    it('cuenta de OTRO tenant: 404 · cuenta ya cerrada: 400 · capacidad inactiva: 403', async () => {
      const v = await crearVenta();
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_B)).rejects.toThrow(NotFoundException);
      expect(venta(v.id).status).toBe('ABIERTA');

      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_A);
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_A)).rejects.toThrow('ya no está abierta');

      caps.mesas_cuenta_abierta = false;
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_A)).rejects.toThrow(ForbiddenException);
    });

    it('lee la venta con lock de escritura (dos cobros simultáneos no pueden pasarse del saldo)', async () => {
      const v = await crearVenta();
      managerFindOne.mockClear();
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 10 }, TENANT_A);
      expect(managerFindOne).toHaveBeenCalledWith(Sale, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    });
  });

  // ── pay / cancel / descuento sobre cuentas con cobros parciales ─────────────────────────
  describe('guardas sobre cuentas con cobros parciales y cierre por las vías de siempre', () => {
    it('pay() (cobro único) se rechaza si la cuenta ya tiene cobros parciales — evita pisar formasPago', async () => {
      const v = await crearVenta();
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 30 }, TENANT_A);
      await expect(service.pay(v.id, { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 }, TENANT_A)).rejects.toThrow('pagos parciales');
      expect(venta(v.id).formasPago).toHaveLength(1);
      expect(venta(v.id).status).toBe('ABIERTA');
    });

    it('cancel() con cobros parciales: 400 (BadRequestException) con mensaje claro, sin tocar stock ni mesa', async () => {
      const v = await crearVenta();
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 30 }, TENANT_A);
      const err: any = await service.cancel(v.id, 'error', TENANT_A).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getStatus()).toBe(400);
      expect(err.message).toBe('La cuenta tiene pagos parciales; no se puede cancelar');
      expect(venta(v.id).status).toBe('ABIERTA');
      expect(venta(v.id).formasPago).toHaveLength(1);
    });

    it('cancel() se rechaza con cobros parciales; applyDiscount() también', async () => {
      const v = await crearVenta();
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 30 }, TENANT_A);
      await expect(service.cancel(v.id, 'error', TENANT_A)).rejects.toThrow('pagos parciales');
      await expect(service.applyDiscount(v.id, 10, 90, TENANT_A)).rejects.toThrow('pagos parciales');
      expect(venta(v.id).status).toBe('ABIERTA');
      expect(Number(venta(v.id).total)).toBe(100);
    });

    it('cancelar una cuenta abierta SIN cobros libera la mesa', async () => {
      const v = await crearVenta();
      expect(mesa()).toBe('OCCUPIED');
      await service.cancel(v.id, 'cliente se fue', TENANT_A);
      expect(venta(v.id).status).toBe('CANCELADA');
      expect(mesa()).toBe('AVAILABLE');
    });

    it('pay() de una cuenta abierta (cobro único de siempre) también libera la mesa', async () => {
      const v = await crearVenta();
      await service.pay(v.id, { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 }, TENANT_A);
      expect(venta(v.id).status).toBe('PAGADA');
      expect(mesa()).toBe('AVAILABLE');
    });

    it('con la capacidad INACTIVA, pay() y cancel() no tocan ninguna mesa (comportamiento de siempre)', async () => {
      caps.mesas_cuenta_abierta = false;
      tables.get('mesa-1').status = 'OCCUPIED'; // estado puesto a mano desde el panel
      const v = await crearVenta();
      await service.pay(v.id, { formaPago: 'EFECTIVO', montoRecibido: 100, cambio: 0 }, TENANT_A);
      expect(mesa()).toBe('OCCUPIED');
    });

    it('un ítem sin cita ni mesa sigue cobrándose por pay() exactamente igual (venta normal)', async () => {
      const v = await crearVenta({ tableId: undefined });
      const r: any = await service.pay(v.id, { formaPago: 'TARJETA', montoRecibido: 100, cambio: 0 }, TENANT_A);
      expect(r.status).toBe('PAGADA');
    });
  });

  // ── consulta ────────────────────────────────────────────────────────────────────────────
  describe('buscarCuentasAbiertas()', () => {
    it('lista solo las ABIERTAS con mesa del tenant, con pagado y saldo', async () => {
      const a = await crearVenta();
      await service.cobrarCuenta(a.id, { formaPago: 'EFECTIVO', monto: 25 }, TENANT_A);
      const b = await crearVenta({ tableId: 'mesa-2' });
      await service.cobrarCuenta(b.id, { formaPago: 'EFECTIVO' }, TENANT_A); // cerrada: no debe aparecer
      await crearVenta({ tableId: undefined, folio: 'SIN-MESA' }); // abierta pero sin mesa: no es cuenta de mesa

      const lista: any[] = await service.buscarCuentasAbiertas(TENANT_A);
      expect(lista).toHaveLength(1);
      expect(lista[0]).toEqual(expect.objectContaining({ id: a.id, tableId: 'mesa-1', pagado: 25, saldoPendiente: 75 }));
    });

    it('filtra por mesa, no ve cuentas de otro tenant y exige la capacidad', async () => {
      await crearVenta();
      expect(await service.buscarCuentasAbiertas(TENANT_A, { tableId: 'mesa-2' })).toHaveLength(0);
      expect(await service.buscarCuentasAbiertas(TENANT_B)).toHaveLength(0);
      caps.mesas_cuenta_abierta = false;
      await expect(service.buscarCuentasAbiertas(TENANT_A)).rejects.toThrow(ForbiddenException);
      await expect(service.buscarCuentasAbiertas(undefined)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── marcas del servidor ─────────────────────────────────────────────────────────────────
  const L = (productoId: string, nombre: string, cantidad: number, precio: number) => ({
    productoId, nombre, cantidad, precioUnitario: precio, descuento: 0, subtotal: Math.round(cantidad * precio * 100) / 100,
  });
  const stock = (id = 'ins-1') => insumos.get(id).stockActual;

  describe('marcas del servidor en los ítems', () => {
    it('los ítems que generan nota de cocina quedan marcados con notaCocinaId (al abrir y al agregar)', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [L('p-simple', 'Taco', 1, 50), L('p-cocina-ins', 'Tacos al pastor', 1, 50)]);
      expect(venta(v.id).items[0].notaCocinaId).toBeUndefined();
      expect(venta(v.id).items[1].notaCocinaId).toBe(notas[0].id);
      await service.agregarItems(v.id, { items: [L('p-cocina-ins', 'Otro', 1, 50), L('p-simple', 'Taco', 1, 50)] }, TENANT_A);
      expect(venta(v.id).items[2].notaCocinaId).toBe(notas[1].id);
      expect(venta(v.id).items[3].notaCocinaId).toBeUndefined();
    });

    it('el cliente no puede falsificarlas: notaCocinaId/anulado del body se descartan (create y agregarItems)', async () => {
      const v = await crearVenta({}, [{ ...L('p-simple', 'Taco', 1, 50), notaCocinaId: 'falsa', anulado: true } as any]);
      expect(venta(v.id).items[0].notaCocinaId).toBeUndefined();
      expect(venta(v.id).items[0].anulado).toBeUndefined();
      await service.agregarItems(v.id, { items: [{ ...L('p-simple', 'Taco', 1, 50), notaCocinaId: 'falsa', anulado: true }] }, TENANT_A);
      expect(venta(v.id).items[1].notaCocinaId).toBeUndefined();
      expect(venta(v.id).items[1].anulado).toBeUndefined();
      // y por eso cancelar SÍ devuelve el stock de ambos (no se les creyó "ya salió a cocina")
      await service.cancel(v.id, 'x', TENANT_A);
      expect(stock()).toBe(100);
    });
  });

  // ── cancelar una cuenta abierta ─────────────────────────────────────────────────────────
  describe('cancelar una cuenta abierta (devolución de stock / merma)', () => {
    it('sin notas de cocina: el stock queda EXACTAMENTE como antes de abrir la cuenta', async () => {
      const antes = stock();
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50)]); // 100 → 98
      await service.agregarItems(v.id, { items: [L('p-simple', 'Taco', 3, 50)] }, TENANT_A); // → 95
      expect(stock()).toBe(95);

      await service.cancel(v.id, 'cliente se fue', TENANT_A);

      expect(stock()).toBe(antes);
      expect(venta(v.id).status).toBe('CANCELADA');
      expect(mesa()).toBe('AVAILABLE');
      expect(mermas).toHaveLength(0);
    });

    it('la devolución queda en el ledger de Costos (ENTRADA_CANCELACION) con el folio de la cuenta', async () => {
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50)]);
      await service.agregarItems(v.id, { items: [L('p-simple', 'Taco', 3, 50)] }, TENANT_A);
      await service.cancel(v.id, 'x', TENANT_A);
      const entradas = movimientos.filter((m) => m.tipo === 'ENTRADA_CANCELACION');
      expect(entradas.map((m) => m.cantidad)).toEqual([2, 3]);
      expect(entradas.map((m) => m.stockResultante)).toEqual([97, 100]);
      expect(entradas.every((m) => m.referencia === venta(v.id).folio && m.tenantId === TENANT_A)).toBe(true);
    });

    it('con ítems ya enviados a cocina: NO devuelve su stock y registra merma por la vía de Costos', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50), L('p-cocina-ins', 'Tacos al pastor', 3, 50)]); // 100 − 5 = 95

      await service.cancel(v.id, 'cliente se fue', TENANT_A);

      expect(stock()).toBe(97); // volvieron solo los 2 que no salieron; los 3 enviados a cocina no
      expect(mermas).toHaveLength(1);
      expect(mermas[0]).toEqual(expect.objectContaining({ categoria: 'MERMAS_FALTANTES', monto: 15, tenantId: TENANT_A, branchId: 'sucursal-A' }));
      expect(mermas[0].detalles).toEqual(expect.objectContaining({ saleId: v.id, folio: venta(v.id).folio }));
      expect(mermas[0].detalles.items).toEqual([expect.objectContaining({ nombre: 'Tacos al pastor', cantidad: 3 })]);
      expect(mermas[0].periodo).toMatch(/^\d{4}-\d{2}$/);
      expect(mesa()).toBe('AVAILABLE');
    });

    it('las notas pendientes se cancelan (salen de la pantalla de cocina); las ya PREPARADAS se conservan', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [L('p-cocina-ins', 'A', 1, 50), L('p-cocina-ins', 'B', 1, 50)]);
      notas[0].estado = 'PREPARADO';
      await service.cancel(v.id, 'x', TENANT_A);
      expect(notas.map((n) => n.estado)).toEqual(['PREPARADO', 'CANCELADA']);
      expect(mermas[0].monto).toBe(10); // ambos ítems salieron a cocina: la merma incluye los dos
    });

    it('falla a mitad de la cancelación: rollback COMPLETO (estado, mesa, stock ya devuelto, ledger y merma)', async () => {
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50), L('p-simple-2', 'Refresco', 1, 30)]); // ins-1: 98, ins-2: 49
      failRestoreOn = 'ins-2'; // la devolución de ins-1 ya ocurrió dentro de la transacción cuando ins-2 falla

      await expect(service.cancel(v.id, 'x', TENANT_A)).rejects.toThrow('fallo simulado al reponer ins-2');

      expect(venta(v.id).status).toBe('ABIERTA');
      expect(mesa()).toBe('OCCUPIED');
      expect(stock('ins-1')).toBe(98); // la devolución de ins-1 se revirtió
      expect(stock('ins-2')).toBe(49);
      expect(movimientos.filter((m) => m.tipo === 'ENTRADA_CANCELACION')).toHaveLength(0);
      expect(mermas).toHaveLength(0);
    });

    it('falla al registrar la merma: se revierte también el stock ya devuelto y las notas siguen pendientes', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50), L('p-cocina-ins', 'Tacos al pastor', 3, 50)]); // 95
      failMermaWrite = true;

      await expect(service.cancel(v.id, 'x', TENANT_A)).rejects.toThrow('merma');

      expect(stock()).toBe(95);
      expect(venta(v.id).status).toBe('ABIERTA');
      expect(notas[0].estado).toBe('PENDIENTE');
      expect(mesa()).toBe('OCCUPIED');
    });

    it('aislamiento: otro tenant no puede cancelar la cuenta (ni devolver su stock)', async () => {
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50)]);
      await expect(service.cancel(v.id, 'x', TENANT_B)).rejects.toThrow('Venta no encontrada');
      expect(venta(v.id).status).toBe('ABIERTA');
      expect(stock()).toBe(98);
      expect(mesa()).toBe('OCCUPIED');
    });

    it('capacidad INACTIVA: cancelar no devuelve stock (comportamiento de siempre)', async () => {
      caps.mesas_cuenta_abierta = false;
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50)]);
      await service.cancel(v.id, 'x', TENANT_A);
      expect(stock()).toBe(98);
      expect(mermas).toHaveLength(0);
    });
  });

  // ── quitar un ítem ──────────────────────────────────────────────────────────────────────
  describe('quitarItem()', () => {
    it('ítem que NO salió a cocina: devuelve su stock, baja total/costoReal y deja la línea anulada', async () => {
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50), L('p-simple-2', 'Refresco', 1, 30)]); // total 130, costoReal 2×5+10 = 20
      const r: any = await service.quitarItem(v.id, 0, TENANT_A);

      expect(stock()).toBe(100);
      expect(stock('ins-2')).toBe(49);
      expect(Number(r.subtotal)).toBe(30);
      expect(Number(r.total)).toBe(30);
      expect(Number(r.costoReal)).toBe(10);
      expect(r.items).toHaveLength(2); // la línea se conserva (anulada) para no mover los índices
      expect(r.items[0].anulado).toBe(true);
      expect(mermas).toHaveLength(0);
    });

    it('ítem que YA salió a cocina: sin devolución de stock, con merma, y su nota pendiente se cancela', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [L('p-simple', 'Taco', 2, 50), L('p-cocina-ins', 'Tacos al pastor', 3, 50)]); // stock 95, costoReal 25
      const r: any = await service.quitarItem(v.id, 1, TENANT_A);

      expect(stock()).toBe(95);
      expect(mermas).toHaveLength(1);
      expect(mermas[0]).toEqual(expect.objectContaining({ categoria: 'MERMAS_FALTANTES', monto: 15 }));
      expect(notas[0].estado).toBe('CANCELADA');
      expect(Number(r.total)).toBe(100);
      expect(Number(r.costoReal)).toBe(25); // el costo de lo ya preparado sigue en la cuenta (se perdió)
      expect(r.items[1].anulado).toBe(true);
    });

    it('el total baja en proporción y conserva los impuestos: 100 + 16 → quitar 40 deja 60 + 9.60 = 69.60', async () => {
      const v = await crearVenta({ impuestos: 16, total: 116 }, [L('p-simple', 'A', 1, 60), L('p-simple', 'B', 1, 40)]);
      const r: any = await service.quitarItem(v.id, 1, TENANT_A);
      expect(Number(r.subtotal)).toBe(60);
      expect(Number(r.impuestos)).toBe(9.6);
      expect(Number(r.total)).toBe(69.6);
    });

    it('no se puede quitar un ítem ya cobrado, uno inexistente ni uno ya quitado', async () => {
      const v = await crearVenta({}, [L('p-simple', 'A', 1, 60), L('p-simple', 'B', 1, 40)]);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A);
      await expect(service.quitarItem(v.id, 0, TENANT_A)).rejects.toThrow('ya fue cobrado');
      await expect(service.quitarItem(v.id, 9, TENANT_A)).rejects.toThrow('no existe');
      await service.quitarItem(v.id, 1, TENANT_A);
      await expect(service.quitarItem(v.id, 1, TENANT_A)).rejects.toThrow('no existe');
    });

    it('no deja el total por debajo de lo ya cobrado', async () => {
      const v = await crearVenta({}, [L('p-simple', 'A', 1, 60), L('p-simple', 'B', 1, 40)]);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 70 }, TENANT_A);
      await expect(service.quitarItem(v.id, 1, TENANT_A)).rejects.toThrow('por debajo de lo ya cobrado');
      expect(venta(v.id).items[1].anulado).toBeUndefined();
      expect(stock()).toBe(98);
    });

    it('después de quitar, la línea anulada no se cobra y el último ítem vivo absorbe el redondeo', async () => {
      const v = await crearVenta({}, [L('p-simple', 'A', 1, 60), L('p-simple', 'B', 1, 40), L('p-simple', 'C', 1, 30)]); // 130
      await service.quitarItem(v.id, 1, TENANT_A); // total 90
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [1] }, TENANT_A)).rejects.toThrow('no existe');
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A);
      const r: any = await service.cobrarCuenta(v.id, { formaPago: 'TARJETA', itemIndexes: [2] }, TENANT_A);
      expect(r.cerrada).toBe(true);
      expect(r.sale.formasPago.map((x: any) => x.monto)).toEqual([60, 30]);
    });

    it('aislamiento: otro tenant → 404 y no toca stock ni la cuenta; capacidad inactiva → 403', async () => {
      const v = await crearVenta({}, [L('p-simple', 'A', 2, 50)]);
      await expect(service.quitarItem(v.id, 0, TENANT_B)).rejects.toThrow(NotFoundException);
      expect(stock()).toBe(98);
      expect(venta(v.id).items[0].anulado).toBeUndefined();
      caps.mesas_cuenta_abierta = false;
      await expect(service.quitarItem(v.id, 0, TENANT_A)).rejects.toThrow(ForbiddenException);
    });

    it('falla a mitad de quitar un ítem enviado a cocina: rollback completo (merma, nota y totales)', async () => {
      caps.notas_cocina_barra = true;
      const v = await crearVenta({}, [L('p-cocina-ins', 'Tacos al pastor', 3, 50)]);
      failMermaWrite = true;
      await expect(service.quitarItem(v.id, 0, TENANT_A)).rejects.toThrow('merma');
      expect(notas[0].estado).toBe('PENDIENTE');
      expect(venta(v.id).items[0].anulado).toBeUndefined();
      expect(Number(venta(v.id).total)).toBe(150);
    });
  });

  // ── split: exactitud de centavos ────────────────────────────────────────────────────────
  describe('split: la suma de los cobros parciales es EXACTAMENTE el total (sin descuadre de centavos)', () => {
    const cents = (n: number) => Math.round(n * 100);
    const sumaCents = (formasPago: any[]) => formasPago.reduce((acc, p) => acc + cents(Number(p.monto)), 0);

    it.each([100, 10, 0.5, 99.99, 380, 1234.57, 7.01])(
      'dividir $%s entre 2..10 personas (los primeros N−1 pagan total/N redondeado, el último omite el monto)',
      async (total) => {
        for (const n of [2, 3, 4, 5, 6, 7, 9, 10]) {
          const v = await crearVenta({ folio: 'SPLIT-' + total + '-' + n }, [L('p-cocina', 'Cuenta', 1, total)]);
          const base = Math.round((total / n) * 100) / 100;
          for (let i = 0; i < n - 1; i++) {
            const parcial: any = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: base }, TENANT_A);
            expect(parcial.cerrada).toBe(false); // nunca cierra antes del último
          }
          const ultimo: any = await service.cobrarCuenta(v.id, { formaPago: 'TARJETA' }, TENANT_A);
          expect(ultimo.cerrada).toBe(true);
          expect(ultimo.saldoPendiente).toBe(0);
          expect(ultimo.sale.formasPago).toHaveLength(n);
          expect(sumaCents(ultimo.sale.formasPago)).toBe(cents(total)); // exacto, al centavo
          expect(Number(ultimo.sale.formasPago[n - 1].monto)).toBeGreaterThan(0);
        }
      },
    );

    it('borde: con un total diminuto ($0.10 entre 6) los pagos redondeados ya cubren todo y la cuenta cierra sin sobrecobrar', async () => {
      const v = await crearVenta({ folio: 'SPLIT-MINI' }, [L('p-cocina', 'Cuenta', 1, 0.1)]);
      let r: any;
      for (let i = 0; i < 5; i++) r = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', monto: 0.02 }, TENANT_A);
      expect(r.cerrada).toBe(true); // 5 × 0.02 = 0.10: el sexto no debe nada
      expect(sumaCents(r.sale.formasPago)).toBe(10);
      await expect(service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO' }, TENANT_A)).rejects.toThrow('ya no está abierta');
    });

    it('por ítems con importes que no cuadran (33.33 + 33.33 + 33.34, 16% de IVA): suma exacta a 116.00', async () => {
      const v = await crearVenta({ impuestos: 16, total: 116 }, [L('p-cocina', 'A', 1, 33.33), L('p-cocina', 'B', 1, 33.33), L('p-cocina', 'C', 1, 33.34)]);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [1] }, TENANT_A);
      const r: any = await service.cobrarCuenta(v.id, { formaPago: 'TARJETA', itemIndexes: [2] }, TENANT_A);
      expect(r.sale.formasPago.map((p: any) => Number(p.monto))).toEqual([38.66, 38.66, 38.68]);
      expect(sumaCents(r.sale.formasPago)).toBe(11600);
      expect(r.cerrada).toBe(true);
    });

    it('por ítems agrupados ([0,2] y luego [1]): suma exacta', async () => {
      const v = await crearVenta({ impuestos: 16, total: 116 }, [L('p-cocina', 'A', 1, 33.33), L('p-cocina', 'B', 1, 33.33), L('p-cocina', 'C', 1, 33.34)]);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0, 2] }, TENANT_A);
      const r: any = await service.cobrarCuenta(v.id, { formaPago: 'TARJETA', itemIndexes: [1] }, TENANT_A);
      expect(sumaCents(r.sale.formasPago)).toBe(11600);
      expect(r.cerrada).toBe(true);
    });

    it('por ítems con descuento global (subtotal 100, total 97.50): suma exacta', async () => {
      const v = await crearVenta({ descuento: 2.5, total: 97.5 }, [L('p-cocina', 'A', 1, 60), L('p-cocina', 'B', 1, 40)]);
      await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [0] }, TENANT_A);
      const r: any = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [1] }, TENANT_A);
      expect(r.sale.formasPago.map((p: any) => Number(p.monto))).toEqual([58.5, 39]);
      expect(sumaCents(r.sale.formasPago)).toBe(9750);
    });

    it('propiedad: 60 cuentas aleatorias (2–6 ítems, IVA 0/8/16%) cobradas ítem por ítem en orden aleatorio suman exacto al total', async () => {
      let seed = 20261003; // generador determinista: la prueba es reproducible
      const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
      for (let caso = 0; caso < 60; caso++) {
        const n = 2 + Math.floor(rnd() * 5);
        const importes = Array.from({ length: n }, () => Math.round((1 + rnd() * 499) * 100) / 100);
        const subtotal = Math.round(importes.reduce((a, b) => a + b, 0) * 100) / 100;
        const tasa = [0, 0.08, 0.16][Math.floor(rnd() * 3)];
        const total = Math.round(subtotal * (1 + tasa) * 100) / 100;
        const v = await crearVenta({ folio: 'PROP-' + caso, impuestos: Math.round((total - subtotal) * 100) / 100, total }, importes.map((m, i) => L('p-cocina', 'I' + i, 1, m)));
        const orden = importes.map((_, i) => i).sort(() => rnd() - 0.5);
        let ultimo: any;
        for (const idx of orden) ultimo = await service.cobrarCuenta(v.id, { formaPago: 'EFECTIVO', itemIndexes: [idx] }, TENANT_A);
        expect(ultimo.cerrada).toBe(true);
        expect(sumaCents(ultimo.sale.formasPago)).toBe(cents(total));
      }
    });
  });
});

// El corte Z solo suma ventas PAGADA: una cuenta abierta (o sus cobros parciales) quedaría fuera
// del corte y, al cobrarse en otro turno, seguiría ligada a este ya cerrado.
describe('ShiftsService.closeShift() — bloqueo con cuentas abiertas en mesas', () => {
  let service: ShiftsService;
  let salesRepo: { count: jest.Mock; find: jest.Mock };
  let shiftsRepo: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    salesRepo = { count: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    shiftsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'turno-1', tenantId: TENANT_A, status: 'ABIERTO', precorteGuardado: true, totalRetiros: 0, totalDepositos: 0 }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftsService,
        { provide: getRepositoryToken(Shift), useValue: shiftsRepo },
        { provide: getRepositoryToken(Sale), useValue: salesRepo },
      ],
    }).compile();
    service = module.get(ShiftsService);
  });

  it('con cuentas abiertas en mesas: no cierra el turno y dice cuántas hay', async () => {
    salesRepo.count.mockResolvedValue(2);
    await expect(service.closeShift('turno-1', { efectivoContado: 0 } as any, TENANT_A)).rejects.toThrow('hay 2 cuenta(s) abierta(s)');
    expect(shiftsRepo.update).not.toHaveBeenCalled();
  });

  it('el bloqueo llega como 400 (BadRequestException) con el mensaje claro, no como 500', async () => {
    salesRepo.count.mockResolvedValue(1);
    const err: any = await service.closeShift('turno-1', { efectivoContado: 0 } as any, TENANT_A).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getStatus()).toBe(400);
    expect(err.message).toBe('No se puede cerrar el turno: hay 1 cuenta(s) abierta(s) en mesas. Cóbralas o cancélalas antes del corte Z.');
  });

  describe('totalDevoluciones', () => {
    const cancelar = (extra: any) => ({ status: 'CANCELADA', total: '100.00', tableId: null, formasPago: null, formaPago: null, ...extra });
    const cerrarConCanceladas = async (canceladas: any[]) => {
      salesRepo.count.mockResolvedValue(0);
      salesRepo.find.mockImplementation(async ({ where }: any) => (where.status === 'CANCELADA' ? canceladas : []));
      await service.closeShift('turno-1', { efectivoContado: 0 } as any, TENANT_A);
      return shiftsRepo.update.mock.calls[0][1].totalDevoluciones;
    };

    it('cuenta abierta de mesa cancelada SIN cobro: no cuenta como devolución', async () => {
      expect(await cerrarConCanceladas([cancelar({ tableId: 'mesa-1' })])).toBe(0);
    });

    it('venta PAGADA cancelada después (con formaPago o formasPago): cuenta igual que siempre, con o sin mesa', async () => {
      const total = await cerrarConCanceladas([
        cancelar({ formaPago: 'EFECTIVO' }),
        cancelar({ tableId: 'mesa-1', formasPago: [{ forma: 'EFECTIVO', monto: 100 }] }),
        cancelar({ total: '50.00', tableId: 'mesa-2', formaPago: 'TARJETA' }),
      ]);
      expect(total).toBe(250);
    });

    it('venta sin mesa cancelada sin cobro: comportamiento previo intacto (sigue contando)', async () => {
      expect(await cerrarConCanceladas([cancelar({})])).toBe(100);
    });

    it('mezcla: solo se descuentan las cuentas de mesa canceladas sin cobro', async () => {
      const total = await cerrarConCanceladas([cancelar({ tableId: 'mesa-1' }), cancelar({ total: '80.00', formaPago: 'EFECTIVO' })]);
      expect(total).toBe(80);
    });
  });

  it('sin cuentas abiertas: cierra como siempre', async () => {
    salesRepo.count.mockResolvedValue(0);
    await service.closeShift('turno-1', { efectivoContado: 0 } as any, TENANT_A);
    expect(shiftsRepo.update).toHaveBeenCalledWith('turno-1', expect.objectContaining({ status: 'CERRADO' }));
  });
});
