import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { AppointmentsService } from '../appointments/appointments.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';
import { InsumoAlertsService } from './insumo-alerts.service';

// Auditoría BUSINESS (hallazgo transversal #6, continuación): SalesService buscaba los
// productos solo por id — una venta de un tenant podía incluir, y descontar el inventario de,
// un producto de OTRO tenant (o uno huérfano sin tenantId) conociendo su UUID.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const INSUMO = { id: 'insumo-1', nombre: 'Insumo', isActive: true, stockActual: 10, stockMinimo: 0, costoUnitario: 5 };

const PRODUCTS: Record<string, any> = {
  'prod-A': { id: 'prod-A', type: 'SIMPLE', insumoId: INSUMO.id, recipeId: null, tenantId: TENANT_A },
  'prod-B': { id: 'prod-B', type: 'SIMPLE', insumoId: INSUMO.id, recipeId: null, tenantId: TENANT_B },
  'prod-huerfano': { id: 'prod-huerfano', type: 'SIMPLE', insumoId: INSUMO.id, recipeId: null, tenantId: null },
};

// Simula el filtro real de TypeORM: con tenantId en el where, solo el dueño ve el producto.
function lookup(where: { id: string; tenantId?: string }) {
  const p = PRODUCTS[where.id];
  if (!p) return Promise.resolve(null);
  if (where.tenantId !== undefined && p.tenantId !== where.tenantId) return Promise.resolve(null);
  return Promise.resolve({ ...p });
}

describe('SalesService.create() — no vende ni descuenta productos de otro tenant', () => {
  let service: SalesService;
  let managerUpdate: jest.Mock;
  let transaction: jest.Mock;

  function saleOf(productoId: string, tenantId = TENANT_A) {
    return {
      items: [{ productoId, cantidad: 2 }] as any,
      subtotal: 100, descuento: 0, impuestos: 0, total: 100,
      cajero: 'cajero-1', turnoId: 'turno-1', sucursalId: 'sucursal-A',
      tenantId, folio: 'VTA-TEST-001',
    };
  }

  beforeEach(async () => {
    managerUpdate = jest.fn().mockResolvedValue(undefined);
    const manager = {
      create: jest.fn((_e, d) => d),
      save: jest.fn((d) => Promise.resolve({ id: 'sale-1', ...d })),
      update: managerUpdate,
      findOne: jest.fn((entity, opts) => {
        if (entity === Product) return lookup(opts.where);
        if (entity === Insumo) return Promise.resolve({ ...INSUMO });
        return Promise.resolve(null);
      }),
    };
    transaction = jest.fn((cb: any) => cb(manager));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: { createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn(({ where }) => lookup(where)) } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn().mockResolvedValue({ ...INSUMO }), manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(TenantSetting), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: DataSource, useValue: { transaction } },
        { provide: InsumoAlertsService, useValue: {} },
        { provide: TenantSettingsService, useValue: { hasPosCapability: jest.fn().mockResolvedValue(false) } },
        { provide: AppointmentsService, useValue: {} },
      ],
    }).compile();
    service = module.get(SalesService);
  });

  it('producto de OTRO tenant: la venta se rechaza y no abre transacción ni descuenta inventario', async () => {
    await expect(service.create(saleOf('prod-B', TENANT_A) as any)).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    expect(managerUpdate).not.toHaveBeenCalled();
  });

  it('producto huérfano (tenantId null): tampoco se puede vender desde ningún tenant', async () => {
    await expect(service.create(saleOf('prod-huerfano', TENANT_A) as any)).rejects.toThrow(BadRequestException);
    expect(managerUpdate).not.toHaveBeenCalled();
  });

  it('producto PROPIO: sigue vendiéndose y descontando normalmente', async () => {
    await service.create(saleOf('prod-A', TENANT_A) as any);
    expect(managerUpdate).toHaveBeenCalledWith(Insumo, INSUMO.id, { stockActual: 8 });
  });

  it('id de producto que no existe en absoluto: conserva el comportamiento de siempre (no descuenta, no falla)', async () => {
    await expect(service.create(saleOf('no-existe', TENANT_A) as any)).resolves.toBeDefined();
    expect(managerUpdate).not.toHaveBeenCalled();
  });

  it('defensa en profundidad: deductInventory y calculateCostoReal también filtran por tenant', async () => {
    // Se llaman directo con el producto de B bajo el tenant A (como si la validación previa no
    // existiera): no debe tocar stock ni sumar costo.
    const manager = {
      findOne: jest.fn((e, o) => (e === Product ? lookup(o.where) : Promise.resolve({ ...INSUMO }))),
      update: managerUpdate, create: jest.fn(), save: jest.fn(),
    };
    await (service as any).deductInventory(manager, [{ productoId: 'prod-B', cantidad: 2 }], 'F-1', TENANT_A, 'suc', false);
    expect(managerUpdate).not.toHaveBeenCalled();
    await expect((service as any).calculateCostoReal([{ productoId: 'prod-B', cantidad: 2 }], TENANT_A, false)).resolves.toBe(0);
  });
});
