import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { PurchasesService } from './purchases.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { Purchase } from './entities/purchase.entity';
import { MovementsService } from '../movements/movements.service';
import { CostsService } from '../costs/costs.service';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { RecipeItem } from '../costs/entities/recipe-item.entity';
import { Inventory } from '../costs/entities/inventory.entity';
import { InventoryMovement } from '../costs/entities/inventory-movement.entity';
import { PhysicalCount } from '../costs/entities/physical-count.entity';
import { Justifiable } from '../costs/entities/justifiable.entity';
import { Almacen } from '../costs/entities/almacen.entity';
import { FamiliaInsumo } from '../costs/entities/familia-insumo.entity';

// Hueco de atomicidad en PurchasesService.createPurchase(): guardaba la factura, incrementaba el
// stock de cada insumo (vía CostsService.updateInsumo) y pasaba la OC a FACTURADA como
// escrituras sueltas, sin transacción compartida — un fallo a medio camino dejaba la factura sin
// stock (o stock sumado de una factura que no quedó). Estas pruebas usan el PurchasesService y el
// CostsService REALES sobre una "base de datos" falsa con semántica de transacción de verdad
// (commit solo si el callback resuelve; si rechaza, TODO lo escrito dentro se descarta) — y el
// repositorio no transaccional del CostsService escribe directo sobre lo ya confirmado, de modo
// que si el código volviera a usarlo por error, las escrituras sobrevivirían al rollback y el
// test lo delataría.
type Db = {
  purchases: any[];
  insumos: Map<string, any>;
  ordenes: Map<string, any>;
};

const clone = (db: Db): Db => ({
  purchases: db.purchases.map((p) => ({ ...p })),
  insumos: new Map([...db.insumos].map(([k, v]) => [k, { ...v }])),
  ordenes: new Map([...db.ordenes].map(([k, v]) => [k, { ...v }])),
});

describe('PurchasesService.createPurchase() — atomicidad compra + stock + OC', () => {
  let service: PurchasesService;
  let committed: Db;
  let failOnInsumoUpdate: string | null;
  let failOnOrderUpdate: boolean;
  let managerFindOne: jest.Mock;
  let updateInsumoSpy: jest.SpyInstance;
  let costsService: CostsService;

  const insumoRepoOver = (db: () => Db) => ({
    findOne: jest.fn(({ where }) => Promise.resolve(db().insumos.get(where.id) ? { ...db().insumos.get(where.id) } : null)),
    update: jest.fn((id: string, patch: any) => {
      if (failOnInsumoUpdate === id) return Promise.reject(new Error(`fallo simulado al actualizar ${id}`));
      Object.assign(db().insumos.get(id), patch);
      return Promise.resolve(undefined);
    }),
  });

  beforeEach(async () => {
    failOnInsumoUpdate = null;
    failOnOrderUpdate = false;
    committed = {
      purchases: [],
      insumos: new Map([
        ['insumo-1', { id: 'insumo-1', stockActual: 10, factorConversion: 24, precioCompra: null }],
        ['insumo-2', { id: 'insumo-2', stockActual: 5, factorConversion: 1, precioCompra: null }],
      ]),
      ordenes: new Map([['oc-1', { id: 'oc-1', status: 'RECIBIDA' }]]),
    };

    managerFindOne = jest.fn();
    const dataSource = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const staging = clone(committed);
        const stagedInsumoRepo = insumoRepoOver(() => staging);
        const manager = {
          create: jest.fn((_entity: any, data: any) => ({ ...data })),
          save: jest.fn((obj: any) => {
            const saved = { id: `compra-${staging.purchases.length + 1}`, ...obj };
            staging.purchases.push(saved);
            return Promise.resolve(saved);
          }),
          findOne: managerFindOne.mockImplementation((entity: any, opts: any) => {
            if (entity === Insumo) return Promise.resolve(staging.insumos.get(opts.where.id) ? { ...staging.insumos.get(opts.where.id) } : null);
            return Promise.resolve(null);
          }),
          update: jest.fn((entity: any, id: string, patch: any) => {
            if (entity === PurchaseOrder) {
              if (failOnOrderUpdate) return Promise.reject(new Error('fallo simulado al marcar la OC'));
              Object.assign(staging.ordenes.get(id), patch);
            }
            return Promise.resolve(undefined);
          }),
          getRepository: jest.fn((entity: any) => (entity === Insumo ? stagedInsumoRepo : undefined)),
        };
        const result = await cb(manager); // si lanza, `staging` se descarta: nada llega a `committed`
        committed = staging;
        return result;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        CostsService, // REAL: updateInsumo(…, manager) es parte de lo que se verifica
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getRepositoryToken(PurchaseOrder), useValue: { update: jest.fn() } },
        { provide: getRepositoryToken(Purchase), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: MovementsService, useValue: {} },
        // Repositorio NO transaccional de Insumo: escribe directo sobre lo confirmado.
        { provide: getRepositoryToken(Insumo), useValue: insumoRepoOver(() => committed) },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(RecipeItem), useValue: {} },
        { provide: getRepositoryToken(Inventory), useValue: {} },
        { provide: getRepositoryToken(InventoryMovement), useValue: {} },
        { provide: getRepositoryToken(PhysicalCount), useValue: {} },
        { provide: getRepositoryToken(Justifiable), useValue: {} },
        { provide: getRepositoryToken(Almacen), useValue: {} },
        { provide: getRepositoryToken(FamiliaInsumo), useValue: {} },
      ],
    }).compile();

    service = module.get(PurchasesService);
    costsService = module.get(CostsService);
    updateInsumoSpy = jest.spyOn(costsService, 'updateInsumo');
  });

  const compra = (extra: Record<string, any> = {}) => ({
    numero: 'F-001',
    tenantId: 'tenant-A',
    items: [
      { insumoId: 'insumo-1', cantidad: 2, descripcion: 'Caja de 24' },
      { insumoId: 'insumo-2', cantidad: 3, descripcion: 'Bolsa' },
    ],
    ...extra,
  });

  it('camino feliz: guarda la compra, suma el stock (× factorConversion) y marca la OC FACTURADA, todo confirmado', async () => {
    await service.createPurchase(compra({ ocId: 'oc-1' }) as any);

    expect(committed.purchases).toHaveLength(1);
    expect(committed.insumos.get('insumo-1')!.stockActual).toBe(10 + 2 * 24);
    expect(committed.insumos.get('insumo-2')!.stockActual).toBe(5 + 3);
    expect(committed.ordenes.get('oc-1')!.status).toBe('FACTURADA');
  });

  it('el incremento de stock usa el EntityManager de la transacción (no el repositorio suelto) y lee con lock de escritura', async () => {
    await service.createPurchase(compra() as any);

    expect(updateInsumoSpy).toHaveBeenCalledTimes(2);
    for (const call of updateInsumoSpy.mock.calls) {
      expect(call[2]).toBeDefined(); // tercer argumento: el manager transaccional
      expect(typeof call[2].getRepository).toBe('function');
    }
    expect(managerFindOne).toHaveBeenCalledWith(Insumo, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });

  it('si falla el stock del SEGUNDO insumo: se revierte todo — ni la compra ni el stock del primero quedan', async () => {
    failOnInsumoUpdate = 'insumo-2';

    await expect(service.createPurchase(compra({ ocId: 'oc-1' }) as any)).rejects.toThrow('fallo simulado al actualizar insumo-2');

    expect(committed.purchases).toHaveLength(0);
    expect(committed.insumos.get('insumo-1')!.stockActual).toBe(10); // el +48 del primero se descartó
    expect(committed.insumos.get('insumo-2')!.stockActual).toBe(5);
    expect(committed.ordenes.get('oc-1')!.status).toBe('RECIBIDA');
  });

  it('si falla la transición de la OC: se revierten también la compra y el stock ya sumado', async () => {
    failOnOrderUpdate = true;

    await expect(service.createPurchase(compra({ ocId: 'oc-1' }) as any)).rejects.toThrow('fallo simulado al marcar la OC');

    expect(committed.purchases).toHaveLength(0);
    expect(committed.insumos.get('insumo-1')!.stockActual).toBe(10);
    expect(committed.insumos.get('insumo-2')!.stockActual).toBe(5);
  });

  it('compra sin items ni OC: se guarda igual, sin tocar stock (comportamiento sin cambio)', async () => {
    await service.createPurchase({ numero: 'F-002', tenantId: 'tenant-A' } as any);

    expect(committed.purchases).toHaveLength(1);
    expect(updateInsumoSpy).not.toHaveBeenCalled();
    expect(committed.insumos.get('insumo-1')!.stockActual).toBe(10);
  });

  it('un insumo que no existe se ignora sin romper la compra (comportamiento sin cambio)', async () => {
    await service.createPurchase(compra({ items: [{ insumoId: 'fantasma', cantidad: 1 }] }) as any);
    expect(committed.purchases).toHaveLength(1);
  });
});

describe('CostsService.updateInsumo() — manager opcional', () => {
  let service: CostsService;
  let insumosRepo: { findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    insumosRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'i1', stockActual: 1, precioCompra: null }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostsService,
        { provide: getRepositoryToken(Insumo), useValue: insumosRepo },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(RecipeItem), useValue: {} },
        { provide: getRepositoryToken(Inventory), useValue: {} },
        { provide: getRepositoryToken(InventoryMovement), useValue: {} },
        { provide: getRepositoryToken(PhysicalCount), useValue: {} },
        { provide: getRepositoryToken(Justifiable), useValue: {} },
        { provide: getRepositoryToken(Almacen), useValue: {} },
        { provide: getRepositoryToken(FamiliaInsumo), useValue: {} },
      ],
    }).compile();
    service = module.get(CostsService);
  });

  it('sin manager: usa el repositorio de siempre', async () => {
    await service.updateInsumo('i1', { stockActual: 9 });
    expect(insumosRepo.update).toHaveBeenCalledWith('i1', expect.objectContaining({ stockActual: 9 }));
  });

  it('con manager: lee y escribe por el repositorio del manager, sin tocar el repositorio suelto', async () => {
    const txRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'i1', stockActual: 1, precioCompra: null }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const manager: any = { getRepository: jest.fn(() => txRepo) };

    await service.updateInsumo('i1', { stockActual: 9 }, manager);

    expect(manager.getRepository).toHaveBeenCalledWith(Insumo);
    expect(txRepo.update).toHaveBeenCalledWith('i1', expect.objectContaining({ stockActual: 9 }));
    expect(insumosRepo.update).not.toHaveBeenCalled();
    expect(insumosRepo.findOne).not.toHaveBeenCalled();
  });
});
