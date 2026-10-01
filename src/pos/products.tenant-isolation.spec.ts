import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PosService } from './pos.service';
import { Product } from './entities/product.entity';
import { PosConfig } from './entities/pos-config.entity';
import { PosCategory } from './entities/category.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

// Auditoría BUSINESS (hallazgo transversal #6, continuación): POST /pos/products guardaba el
// tenantId del body tal cual (null si no venía → producto huérfano, invisible para todo tenant
// e imposible de editar/borrar por la API), PUT permitía reasignar el producto a otro tenant
// mandando tenantId en el body, y POST /pos/products/import creaba productos sin tenantId y
// buscaba categorías de todos los tenants.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

describe('ProductsService — create()/update() toman el tenant del JWT', () => {
  let service: ProductsService;
  let productsRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    productsRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ id: 'nuevo', ...d })),
      findOne: jest.fn(({ where }) => {
        // Producto p-A pertenece a TENANT_A; con tenantId en el filtro solo lo ve su dueño.
        if (where.id !== 'p-A') return Promise.resolve(null);
        if (where.tenantId && where.tenantId !== TENANT_A) return Promise.resolve(null);
        return Promise.resolve({ id: 'p-A', tenantId: TENANT_A });
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  describe('create()', () => {
    it('impone el tenantId resuelto sobre el que traiga el body', async () => {
      await service.create({ name: 'X', tenantId: TENANT_B } as any, TENANT_A);
      expect(productsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'X', tenantId: TENANT_A }));
    });

    it('sin tenant resuelto: rechaza y no guarda nada (no pueden existir productos huérfanos)', () => {
      expect(() => service.create({ name: 'X' } as any, undefined)).toThrow(BadRequestException);
      expect(() => service.create({ name: 'X', tenantId: null } as any, '')).toThrow(BadRequestException);
      expect(productsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('descarta tenantId e id del body: un ADMIN no puede reasignar el producto a otro tenant', async () => {
      await service.update('p-A', { name: 'Nuevo', tenantId: TENANT_B, id: 'otro' } as any, TENANT_A);
      expect(productsRepo.update).toHaveBeenCalledTimes(1);
      const [id, payload] = productsRepo.update.mock.calls[0];
      expect(id).toBe('p-A');
      expect(payload).toEqual(expect.objectContaining({ name: 'Nuevo' }));
      expect(payload).not.toHaveProperty('tenantId');
      expect(payload).not.toHaveProperty('id');
    });

    it('tampoco permite dejarlo huérfano mandando tenantId: null', async () => {
      await service.update('p-A', { tenantId: null } as any, TENANT_A);
      expect(productsRepo.update.mock.calls[0][1]).not.toHaveProperty('tenantId');
    });

    it('producto de otro tenant: NotFoundException y no actualiza', async () => {
      await expect(service.update('p-A', { name: 'Hack' } as any, TENANT_B)).rejects.toThrow(NotFoundException);
      expect(productsRepo.update).not.toHaveBeenCalled();
    });

    it('SOPORTE (sin tenantId): conserva acceso, pero el producto debe existir', async () => {
      await expect(service.update('p-A', { name: 'Soporte' } as any, undefined)).resolves.toBeDefined();
      await expect(service.update('no-existe', { name: 'X' } as any, undefined)).rejects.toThrow(NotFoundException);
    });
  });
});

describe('ProductsController.create() — resolución del tenant', () => {
  let controller: ProductsController;
  let service: { create: jest.Mock };

  beforeEach(async () => {
    service = { create: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();
    controller = module.get(ProductsController);
  });

  it('el tenantId del JWT gana sobre el del body', () => {
    controller.create({ name: 'X', tenantId: TENANT_B }, { user: { tenantId: TENANT_A } });
    expect(service.create).toHaveBeenCalledWith(expect.anything(), TENANT_A);
  });

  it('SOPORTE (JWT sin tenantId): usa body.tenantId como fallback', () => {
    controller.create({ name: 'X', tenantId: TENANT_B }, { user: {} });
    expect(service.create).toHaveBeenCalledWith(expect.anything(), TENANT_B);
  });

  it('sin tenant en ninguno de los dos lados: pasa undefined (el servicio rechaza)', () => {
    controller.create({ name: 'X' }, { user: {} });
    expect(service.create).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});

describe('PosService.importProducts() — tenant del JWT y categorías solo del tenant', () => {
  let service: PosService;
  let productRepo: { create: jest.Mock; save: jest.Mock };
  let categoryRepo: { find: jest.Mock };
  let branchRepo: { find: jest.Mock };
  let companyRepo: { find: jest.Mock };

  beforeEach(async () => {
    productRepo = { create: jest.fn((d) => d), save: jest.fn().mockResolvedValue(undefined) };
    companyRepo = { find: jest.fn(({ where }) => Promise.resolve([{ id: where.tenantId === TENANT_A ? 'co-A' : 'co-B' }])) };
    branchRepo = { find: jest.fn(() => Promise.resolve([{ id: 'br-A' }])) };
    // Dos categorías con el MISMO nombre en tenants distintos: solo la de br-A es del tenant A.
    categoryRepo = {
      find: jest.fn(({ where }) => {
        const todas = [
          { id: 'cat-A', name: 'Bebidas', branchId: 'br-A' },
          { id: 'cat-B', name: 'Bebidas', branchId: 'br-B' },
        ];
        const ids: string[] = where.branchId?.value ?? [];
        return Promise.resolve(todas.filter((c) => ids.includes(c.branchId)));
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosService,
        { provide: getRepositoryToken(PosConfig), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(PosCategory), useValue: categoryRepo },
        { provide: getRepositoryToken(Branch), useValue: branchRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
      ],
    }).compile();
    service = module.get(PosService);
  });

  it('asigna el tenantId del JWT a cada producto creado', async () => {
    const r = await service.importProducts([{ nombre: 'Cola', categoria: 'Bebidas', precio: '20' }], TENANT_A);
    expect(r.success).toBe(1);
    expect(productRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cola', tenantId: TENANT_A }));
  });

  it('resuelve categorías vía Company(tenantId) → Branch, nunca una de otro tenant con el mismo nombre', async () => {
    await service.importProducts([{ nombre: 'Cola', categoria: 'Bebidas', precio: '20' }], TENANT_A);
    expect(companyRepo.find).toHaveBeenCalledWith({ where: { tenantId: TENANT_A } });
    expect(productRepo.create.mock.calls[0][0].categoryId).toBe('cat-A');
  });

  it('categoría que solo existe en otro tenant: la fila se reporta como error y no crea producto', async () => {
    branchRepo.find.mockResolvedValue([]); // el tenant no tiene sucursales → ninguna categoría visible
    const r = await service.importProducts([{ nombre: 'Cola', categoria: 'Bebidas', precio: '20' }], TENANT_A);
    expect(r.success).toBe(0);
    expect(r.errors[0].message).toContain('no existe');
    expect(productRepo.save).not.toHaveBeenCalled();
  });

  it('sin tenant (SOPORTE): rechaza el import completo', async () => {
    await expect(
      service.importProducts([{ nombre: 'Cola', categoria: 'Bebidas', precio: '20' }], undefined),
    ).rejects.toThrow(BadRequestException);
    expect(productRepo.save).not.toHaveBeenCalled();
  });
});
