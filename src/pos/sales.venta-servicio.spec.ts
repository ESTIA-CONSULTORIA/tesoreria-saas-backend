import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from './insumo-alerts.service';

// POS flexible, capacidad venta_de_servicio: valida el gating en las TRES ramas de
// SalesService que deciden si un ítem toca inventario (calculateCostoReal,
// checkStockAvailability, deductInventory), en AMBAS direcciones — con la capacidad activa un
// servicio nunca descuenta/cuesta/exige stock aunque tenga insumoId vinculado por error; con
// la capacidad inactiva esServicio=true se ignora y el producto se comporta como uno normal.
// Se prueba contra create() real (mismo patrón que sales.notas-cocina.spec.ts).
const INSUMO = {
  id: 'insumo-1',
  nombre: 'Gasa',
  isActive: true,
  stockActual: 10,
  stockMinimo: 0,
  costoUnitario: 5,
};

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'producto-1',
    name: 'Consulta',
    type: 'SIMPLE',
    insumoId: INSUMO.id, // vinculado "por error" a un insumo
    recipeId: null,
    isActive: true,
    esServicio: false,
    ...overrides,
  } as unknown as Product;
}

describe('SalesService.create() — capacidad venta_de_servicio', () => {
  let service: SalesService;
  let tenantSettingRepo: { findOne: jest.Mock };
  let hasPosCapability: jest.Mock;
  let managerCreate: jest.Mock;
  let managerUpdate: jest.Mock;
  const productsById = new Map<string, Product>();

  const TENANT_A = 'tenant-A';

  function baseSaleData(cantidad: number) {
    return {
      items: [{ productoId: 'p1', cantidad }] as any,
      subtotal: 100,
      descuento: 0,
      impuestos: 0,
      total: 100,
      cajero: 'cajero-1',
      turnoId: 'turno-1',
      sucursalId: 'sucursal-A',
      tenantId: TENANT_A,
      folio: 'VTA-TEST-001',
    };
  }

  const stockUpdates = () => managerUpdate.mock.calls.filter(([entity]) => entity === Insumo);
  const costoRealGuardado = () => managerCreate.mock.calls.find(([entity]) => entity === Sale)![1].costoReal;

  beforeEach(async () => {
    productsById.clear();
    const insumoRepo = {
      findOne: jest.fn().mockResolvedValue({ ...INSUMO }),
      manager: { findOne: jest.fn() },
    };
    tenantSettingRepo = { findOne: jest.fn().mockResolvedValue(null) };
    hasPosCapability = jest.fn();

    managerCreate = jest.fn((_entity, data) => data);
    managerUpdate = jest.fn().mockResolvedValue(undefined);
    const manager = {
      create: managerCreate,
      save: jest.fn((data) => Promise.resolve({ id: data.id || 'sale-1', ...data })),
      update: managerUpdate,
      findOne: jest.fn((entity, opts) => {
        if (entity === Product) return Promise.resolve(productsById.get(opts.where.id) || null);
        if (entity === Insumo) return Promise.resolve({ ...INSUMO });
        return Promise.resolve(null);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: { createQueryBuilder: jest.fn() } },
        {
          provide: getRepositoryToken(Product),
          useValue: { findOne: jest.fn(({ where }) => Promise.resolve(productsById.get(where.id) || null)) },
        },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: insumoRepo },
        { provide: getRepositoryToken(TenantSetting), useValue: tenantSettingRepo },
        { provide: DataSource, useValue: { transaction: jest.fn((cb: any) => cb(manager)) } },
        { provide: InsumoAlertsService, useValue: {} },
        { provide: TenantSettingsService, useValue: { hasPosCapability } },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  it('capacidad ACTIVA + esServicio=true con insumo vinculado por error: NO descuenta stock ni suma costoReal', async () => {
    hasPosCapability.mockResolvedValue(true);
    productsById.set('p1', buildProduct({ esServicio: true }));

    await service.create(baseSaleData(2) as any);

    expect(hasPosCapability).toHaveBeenCalledWith(TENANT_A, 'venta_de_servicio');
    expect(stockUpdates()).toHaveLength(0);
    expect(costoRealGuardado()).toBe(0);
  });

  it('capacidad INACTIVA + esServicio=true con insumo vinculado por error: descuenta igual (comportamiento normal)', async () => {
    hasPosCapability.mockResolvedValue(false);
    productsById.set('p1', buildProduct({ esServicio: true }));

    await service.create(baseSaleData(2) as any);

    expect(stockUpdates()).toEqual([[Insumo, INSUMO.id, { stockActual: 8 }]]);
    expect(costoRealGuardado()).toBe(10); // 5 * 2
  });

  it('capacidad ACTIVA + esServicio=false (producto físico): descuenta normalmente', async () => {
    hasPosCapability.mockResolvedValue(true);
    productsById.set('p1', buildProduct({ esServicio: false }));

    await service.create(baseSaleData(3) as any);

    expect(stockUpdates()).toEqual([[Insumo, INSUMO.id, { stockActual: 7 }]]);
    expect(costoRealGuardado()).toBe(15);
  });

  describe('stockPolicy BLOQUEAR con stock insuficiente (requerido 50 > disponible 10)', () => {
    beforeEach(() => {
      tenantSettingRepo.findOne.mockResolvedValue({ stockPolicy: 'BLOQUEAR' });
    });

    it('capacidad ACTIVA + esServicio=true: la venta NO se rechaza', async () => {
      hasPosCapability.mockResolvedValue(true);
      productsById.set('p1', buildProduct({ esServicio: true }));

      await expect(service.create(baseSaleData(50) as any)).resolves.toBeDefined();
      expect(stockUpdates()).toHaveLength(0);
    });

    it('capacidad INACTIVA + esServicio=true: la venta SÍ se rechaza (el flag se ignora)', async () => {
      hasPosCapability.mockResolvedValue(false);
      productsById.set('p1', buildProduct({ esServicio: true }));

      await expect(service.create(baseSaleData(50) as any)).rejects.toThrow('Stock insuficiente');
    });
  });
});
