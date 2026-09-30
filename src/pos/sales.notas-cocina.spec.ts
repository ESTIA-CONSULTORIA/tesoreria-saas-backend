import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { NotaCocina } from './entities/nota-cocina.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from './insumo-alerts.service';

// Ronda de seguimiento (POS flexible, capacidad notas_cocina_barra): valida que
// SalesService.create() genera NotaCocina como paso ADICIONAL dentro de su propia
// transacción, sin duplicar la lógica de venta — no se mockea generateNotasCocina() en
// aislamiento, se prueba contra create() real para que un cambio futuro en el gating o en
// la fórmula de generación rompa esta prueba si cambia el comportamiento observable.
function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'producto-1',
    name: 'Producto de prueba',
    type: 'SIMPLE',
    insumoId: null, // sin insumoId: deductInventory() no intenta descontar stock — estas
                     // pruebas son sobre notas de cocina, no sobre inventario.
    recipeId: null,
    isActive: true,
    estacionPreparacion: null,
    ...overrides,
  } as Product;
}

describe('SalesService.create() — generación de NotaCocina', () => {
  let service: SalesService;
  let productRepo: { findOne: jest.Mock };
  let tenantSettingRepo: { findOne: jest.Mock };
  let hasPosCapability: jest.Mock;
  let managerCreate: jest.Mock;
  let managerSave: jest.Mock;
  let managerFindOne: jest.Mock;
  let managerUpdate: jest.Mock;

  const TENANT_A = 'tenant-A';
  const SUCURSAL_A = 'sucursal-A';

  function baseSaleData(items: { productoId: string; cantidad: number }[]) {
    return {
      items: items as any,
      subtotal: 100,
      descuento: 0,
      impuestos: 0,
      total: 100,
      cajero: 'cajero-1',
      turnoId: 'turno-1',
      sucursalId: SUCURSAL_A,
      tenantId: TENANT_A,
      folio: 'VTA-TEST-001', // evita generateFolio() (no se mockea salesRepo.createQueryBuilder)
    };
  }

  beforeEach(async () => {
    const productsById = new Map<string, Product>();

    productRepo = {
      findOne: jest.fn(({ where }) => Promise.resolve(productsById.get(where.id) || null)),
    };
    tenantSettingRepo = {
      // PERMITIR_NEGATIVO (default): checkStockAvailability() no hace nada más, no hace
      // falta mockear insumoRepo para estas pruebas.
      findOne: jest.fn().mockResolvedValue(null),
    };
    hasPosCapability = jest.fn();

    managerCreate = jest.fn((_entity, data) => data);
    managerSave = jest.fn((data) => Promise.resolve({ id: data.id || 'sale-1', ...data }));
    managerFindOne = jest.fn((entity, opts) => {
      if (entity === Product) return Promise.resolve(productsById.get(opts.where.id) || null);
      return Promise.resolve(null);
    });
    managerUpdate = jest.fn().mockResolvedValue(undefined);

    const manager = { create: managerCreate, save: managerSave, findOne: managerFindOne, update: managerUpdate };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: { createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: tenantSettingRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: InsumoAlertsService, useValue: {} },
        { provide: TenantSettingsService, useValue: { hasPosCapability } },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);

    // Expuesto para que cada test registre sus propios productos.
    (service as any).__productsById = productsById;
  });

  function registerProduct(p: Product) {
    ((service as any).__productsById as Map<string, Product>).set(p.id, p);
  }

  it('capacidad DESACTIVADA: no genera ninguna NotaCocina aunque el producto tenga estación', async () => {
    hasPosCapability.mockResolvedValue(false);
    registerProduct(buildProduct({ id: 'p1', estacionPreparacion: 'COCINA' }));

    await service.create(baseSaleData([{ productoId: 'p1', cantidad: 2 }]) as any);

    const notaCalls = managerCreate.mock.calls.filter(([entity]) => entity === NotaCocina);
    expect(notaCalls).toHaveLength(0);
    expect(hasPosCapability).toHaveBeenCalledWith(TENANT_A, 'notas_cocina_barra');
  });

  it('capacidad activada, producto SIN estación asignada: no genera nota para ese ítem', async () => {
    hasPosCapability.mockResolvedValue(true);
    registerProduct(buildProduct({ id: 'p1', estacionPreparacion: null }));

    await service.create(baseSaleData([{ productoId: 'p1', cantidad: 1 }]) as any);

    const notaCalls = managerCreate.mock.calls.filter(([entity]) => entity === NotaCocina);
    expect(notaCalls).toHaveLength(0);
  });

  it('capacidad activada, producto CON estación COCINA: genera una NotaCocina con los datos correctos', async () => {
    hasPosCapability.mockResolvedValue(true);
    registerProduct(buildProduct({ id: 'p1', name: 'Tacos al pastor', estacionPreparacion: 'COCINA' }));

    const sale = await service.create(baseSaleData([{ productoId: 'p1', cantidad: 3 }]) as any);

    const notaCalls = managerCreate.mock.calls.filter(([entity]) => entity === NotaCocina);
    expect(notaCalls).toHaveLength(1);
    expect(notaCalls[0][1]).toEqual(
      expect.objectContaining({
        tenantId: TENANT_A,
        sucursalId: SUCURSAL_A,
        saleId: sale.id,
        productoId: 'p1',
        nombre: 'Tacos al pastor',
        cantidad: 3,
        estacion: 'COCINA',
        estado: 'PENDIENTE',
      }),
    );
    expect(managerSave).toHaveBeenCalledWith(expect.objectContaining({ estacion: 'COCINA' }));
  });

  it('venta con ítems de COCINA y BARRA mezclados: genera una nota por cada uno, con su propia estación', async () => {
    hasPosCapability.mockResolvedValue(true);
    registerProduct(buildProduct({ id: 'p1', name: 'Hamburguesa', estacionPreparacion: 'COCINA' }));
    registerProduct(buildProduct({ id: 'p2', name: 'Mojito', estacionPreparacion: 'BARRA' }));
    registerProduct(buildProduct({ id: 'p3', name: 'Agua embotellada', estacionPreparacion: null }));

    await service.create(
      baseSaleData([
        { productoId: 'p1', cantidad: 1 },
        { productoId: 'p2', cantidad: 2 },
        { productoId: 'p3', cantidad: 1 },
      ]) as any,
    );

    const notaCalls = managerCreate.mock.calls.filter(([entity]) => entity === NotaCocina);
    expect(notaCalls).toHaveLength(2);
    expect(notaCalls.map(([, data]) => data.estacion).sort()).toEqual(['BARRA', 'COCINA']);
    expect(notaCalls.map(([, data]) => data.nombre).sort()).toEqual(['Hamburguesa', 'Mojito']);
  });

  it('estacion queda COPIADA al crear la nota — cambiar el producto después no afecta notas ya generadas', async () => {
    hasPosCapability.mockResolvedValue(true);
    const producto = buildProduct({ id: 'p1', name: 'Pizza', estacionPreparacion: 'COCINA' });
    registerProduct(producto);

    await service.create(baseSaleData([{ productoId: 'p1', cantidad: 1 }]) as any);

    const [, notaData] = managerCreate.mock.calls.find(([entity]) => entity === NotaCocina)!;
    expect(notaData.estacion).toBe('COCINA');

    // Cambiar el producto DESPUÉS de generada la nota no debe alterar el valor ya copiado —
    // no hay ningún mecanismo de lectura en este servicio que re-derive la estación desde
    // el producto vigente, así que la nota generada arriba sigue siendo 'COCINA' aunque el
    // mock del producto ahora diga 'BARRA'.
    producto.estacionPreparacion = 'BARRA';
    expect(notaData.estacion).toBe('COCINA');
  });
});
