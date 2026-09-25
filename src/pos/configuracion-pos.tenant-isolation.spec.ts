import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { TablesService } from './tables.service';
import { CategoriesService } from './categories.service';
import { AreasService } from './areas.service';
import { Product } from './entities/product.entity';
import { Table } from './entities/table.entity';
import { PosCategory } from './entities/category.entity';
import { Area } from './entities/area.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

// Auditoría BUSINESS (hallazgo transversal #6, continuación): mismo patrón ya cerrado en
// sales/shifts — update(id)/delete(id) no verificaban que el recurso perteneciera al tenant
// de quien llama. Product y Table tienen tenantId propio (fix directo, mismo patrón que
// banks.service.ts); PosCategory y Area solo tienen branchId, se resuelve vía
// branchId → Branch → Company.tenantId (mismo patrón de dos saltos que branches.service.ts).
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

describe('ProductsService — aislamiento por tenant', () => {
  let service: ProductsService;
  let productsRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  const PRODUCT_B = 'product-B';

  function fakeLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== PRODUCT_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: PRODUCT_B, tenantId: TENANT_B, name: 'Producto B' });
  }

  beforeEach(async () => {
    productsRepo = {
      findOne: jest.fn(({ where }) => fakeLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = module.get<ProductsService>(ProductsService);
  });

  describe('findOne()', () => {
    it('no devuelve el producto de OTRO tenant', async () => {
      await expect(service.findOne(PRODUCT_B, TENANT_A)).resolves.toBeNull();
    });
    it('sí devuelve el producto del MISMO tenant', async () => {
      await expect(service.findOne(PRODUCT_B, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('update()', () => {
    it('rechaza editar el producto de OTRO tenant', async () => {
      await expect(service.update(PRODUCT_B, { name: 'hackeado' }, TENANT_A)).rejects.toThrow();
      expect(productsRepo.update).not.toHaveBeenCalled();
    });
    it('permite editar el producto del MISMO tenant', async () => {
      await expect(service.update(PRODUCT_B, { name: 'nuevo' }, TENANT_B)).resolves.toBeDefined();
      expect(productsRepo.update).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('rechaza borrar el producto de OTRO tenant', async () => {
      await expect(service.delete(PRODUCT_B, TENANT_A)).rejects.toThrow();
      expect(productsRepo.delete).not.toHaveBeenCalled();
    });
    it('permite borrar el producto del MISMO tenant', async () => {
      await expect(service.delete(PRODUCT_B, TENANT_B)).resolves.toEqual({ deleted: true });
    });
  });
});

describe('TablesService — aislamiento por tenant', () => {
  let service: TablesService;
  let tablesRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  const TABLE_B = 'table-B';

  function fakeLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== TABLE_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: TABLE_B, tenantId: TENANT_B, number: 1 });
  }

  beforeEach(async () => {
    tablesRepo = {
      findOne: jest.fn(({ where }) => fakeLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TablesService, { provide: getRepositoryToken(Table), useValue: tablesRepo }],
    }).compile();
    service = module.get<TablesService>(TablesService);
  });

  describe('update()', () => {
    it('rechaza editar la mesa de OTRO tenant', async () => {
      await expect(service.update(TABLE_B, { number: 2 }, TENANT_A)).rejects.toThrow();
      expect(tablesRepo.update).not.toHaveBeenCalled();
    });
    it('permite editar la mesa del MISMO tenant', async () => {
      await expect(service.update(TABLE_B, { number: 2 }, TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('delete()', () => {
    it('rechaza borrar la mesa de OTRO tenant', async () => {
      await expect(service.delete(TABLE_B, TENANT_A)).rejects.toThrow();
      expect(tablesRepo.delete).not.toHaveBeenCalled();
    });
    it('permite borrar la mesa del MISMO tenant', async () => {
      await expect(service.delete(TABLE_B, TENANT_B)).resolves.toEqual({ deleted: true });
    });
  });
});

describe('CategoriesService — aislamiento por tenant (vía branchId → Branch → Company)', () => {
  let service: CategoriesService;
  let categoriesRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let branchesRepo: { findOne: jest.Mock };
  let companiesRepo: { findOne: jest.Mock };
  const CATEGORY_B = 'category-B';
  const BRANCH_B = 'branch-B';
  const COMPANY_B = 'company-B';

  beforeEach(async () => {
    categoriesRepo = {
      findOne: jest.fn(({ where }) =>
        where.id === CATEGORY_B
          ? Promise.resolve({ id: CATEGORY_B, branchId: BRANCH_B, name: 'Categoria B' })
          : Promise.resolve(null),
      ),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    branchesRepo = {
      findOne: jest.fn(({ where }) =>
        where.id === BRANCH_B ? Promise.resolve({ id: BRANCH_B, companyId: COMPANY_B }) : Promise.resolve(null),
      ),
    };
    companiesRepo = {
      findOne: jest.fn(({ where }) => {
        if (where.id !== COMPANY_B) return Promise.resolve(null);
        if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
        return Promise.resolve({ id: COMPANY_B, tenantId: TENANT_B });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(PosCategory), useValue: categoriesRepo },
        { provide: getRepositoryToken(Branch), useValue: branchesRepo },
        { provide: getRepositoryToken(Company), useValue: companiesRepo },
      ],
    }).compile();
    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('update()', () => {
    it('rechaza editar la categoría de OTRO tenant', async () => {
      await expect(service.update(CATEGORY_B, { name: 'hackeada' }, TENANT_A)).rejects.toThrow();
      expect(categoriesRepo.update).not.toHaveBeenCalled();
    });
    it('permite editar la categoría del MISMO tenant', async () => {
      await expect(service.update(CATEGORY_B, { name: 'nueva' }, TENANT_B)).resolves.toBeDefined();
      expect(categoriesRepo.update).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('rechaza borrar la categoría de OTRO tenant', async () => {
      await expect(service.delete(CATEGORY_B, TENANT_A)).rejects.toThrow();
      expect(categoriesRepo.delete).not.toHaveBeenCalled();
    });
    it('permite borrar la categoría del MISMO tenant', async () => {
      await expect(service.delete(CATEGORY_B, TENANT_B)).resolves.toEqual({ deleted: true });
    });
  });
});

describe('AreasService — aislamiento por tenant (vía branchId → Branch → Company)', () => {
  let service: AreasService;
  let areasRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let branchesRepo: { findOne: jest.Mock };
  let companiesRepo: { findOne: jest.Mock };
  const AREA_B = 'area-B';
  const BRANCH_B = 'branch-B';
  const COMPANY_B = 'company-B';

  beforeEach(async () => {
    areasRepo = {
      findOne: jest.fn(({ where }) =>
        where.id === AREA_B
          ? Promise.resolve({ id: AREA_B, branchId: BRANCH_B, name: 'Area B' })
          : Promise.resolve(null),
      ),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    branchesRepo = {
      findOne: jest.fn(({ where }) =>
        where.id === BRANCH_B ? Promise.resolve({ id: BRANCH_B, companyId: COMPANY_B }) : Promise.resolve(null),
      ),
    };
    companiesRepo = {
      findOne: jest.fn(({ where }) => {
        if (where.id !== COMPANY_B) return Promise.resolve(null);
        if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
        return Promise.resolve({ id: COMPANY_B, tenantId: TENANT_B });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreasService,
        { provide: getRepositoryToken(Area), useValue: areasRepo },
        { provide: getRepositoryToken(Branch), useValue: branchesRepo },
        { provide: getRepositoryToken(Company), useValue: companiesRepo },
      ],
    }).compile();
    service = module.get<AreasService>(AreasService);
  });

  describe('update()', () => {
    it('rechaza editar el área de OTRO tenant', async () => {
      await expect(service.update(AREA_B, { name: 'hackeada' }, TENANT_A)).rejects.toThrow();
      expect(areasRepo.update).not.toHaveBeenCalled();
    });
    it('permite editar el área del MISMO tenant', async () => {
      await expect(service.update(AREA_B, { name: 'nueva' }, TENANT_B)).resolves.toBeDefined();
      expect(areasRepo.update).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('rechaza borrar el área de OTRO tenant', async () => {
      await expect(service.delete(AREA_B, TENANT_A)).rejects.toThrow();
      expect(areasRepo.delete).not.toHaveBeenCalled();
    });
    it('permite borrar el área del MISMO tenant', async () => {
      await expect(service.delete(AREA_B, TENANT_B)).resolves.toEqual({ deleted: true });
    });
  });
});
