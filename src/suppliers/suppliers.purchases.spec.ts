import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { Supplier } from './entities/supplier.entity';
import { Purchase } from '../purchases/entities/purchase.entity';

// Auditoría BUSINESS (recomendación #4 de la lista de seguimiento): GET /suppliers/:id/purchases
// era un stub que siempre devolvía [], con un comentario literal diciendo que se
// implementaría "cuando se cree el módulo de compras" — pero ese módulo (src/purchases/) ya
// existe. Se conecta la consulta real, filtrada por tenant (Purchase.tenantId +
// Purchase.supplierId ya son suficientes para que un supplierId de otro tenant nunca
// devuelva nada, sin necesitar una verificación de pertenencia aparte).
describe('SuppliersController.getSupplierPurchases()', () => {
  let controller: SuppliersController;
  let service: { findPurchasesBySupplier: jest.Mock };

  beforeEach(async () => {
    service = { findPurchasesBySupplier: jest.fn().mockResolvedValue([{ id: 'purchase-1', total: 500 }]) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [{ provide: SuppliersService, useValue: service }],
    }).compile();
    controller = module.get<SuppliersController>(SuppliersController);
  });

  it('ya no es un stub — delega en SuppliersService con el supplierId y el tenantId del JWT', async () => {
    const result = await controller.getSupplierPurchases('supplier-1', { user: { tenantId: 'tenant-A' } } as any);
    expect(service.findPurchasesBySupplier).toHaveBeenCalledWith('supplier-1', 'tenant-A');
    expect(result).toEqual([{ id: 'purchase-1', total: 500 }]);
  });
});

describe('SuppliersService.findPurchasesBySupplier()', () => {
  let service: SuppliersService;
  let purchasesRepo: { find: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const SUPPLIER_B = 'supplier-B';

  beforeEach(async () => {
    purchasesRepo = {
      find: jest.fn(({ where }) => {
        if (where.supplierId !== SUPPLIER_B) return Promise.resolve([]);
        if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve([]);
        return Promise.resolve([{ id: 'purchase-1', supplierId: SUPPLIER_B, tenantId: TENANT_B, total: 500 }]);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getRepositoryToken(Supplier), useValue: { find: jest.fn(), findOne: jest.fn() } },
        { provide: getRepositoryToken(Purchase), useValue: purchasesRepo },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
  });

  it('no devuelve compras de un proveedor consultado desde OTRO tenant', async () => {
    await expect(service.findPurchasesBySupplier(SUPPLIER_B, TENANT_A)).resolves.toEqual([]);
  });

  it('sí devuelve las compras reales del proveedor del MISMO tenant', async () => {
    await expect(service.findPurchasesBySupplier(SUPPLIER_B, TENANT_B)).resolves.toEqual([
      { id: 'purchase-1', supplierId: SUPPLIER_B, tenantId: TENANT_B, total: 500 },
    ]);
  });
});
