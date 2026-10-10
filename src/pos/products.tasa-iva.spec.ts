import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PosService } from './pos.service';
import { Product } from './entities/product.entity';
import { PosConfig } from './entities/pos-config.entity';
import { PosCategory } from './entities/category.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';

// tasaIva por producto: '16' | '8' | '0' | 'EXENTO'; null o vacío = usa la del negocio; cualquier otro valor es 400.
const TENANT_A = 'tenant-A';

describe('Product.tasaIva — alta, edición e importación', () => {
  let products: ProductsService;
  let pos: PosService;
  let guardados: any[];
  let actualizados: any[];

  beforeEach(async () => {
    guardados = [];
    actualizados = [];
    const productRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => { guardados.push(d); return Promise.resolve(d); }),
      findOne: jest.fn(({ where }: any) => Promise.resolve(where.id === 'p-1' && where.tenantId === TENANT_A ? { id: 'p-1', tenantId: TENANT_A, name: 'Taco' } : null)),
      update: jest.fn((id: string, patch: any) => { actualizados.push({ id, patch }); return Promise.resolve(undefined); }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        PosService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Insumo), useValue: {} },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(PosConfig), useValue: {} },
        { provide: getRepositoryToken(PosCategory), useValue: { find: jest.fn(() => Promise.resolve([{ id: 'cat-1', name: 'Bebidas', branchId: 'br-1', isActive: true }])) } },
        { provide: getRepositoryToken(Branch), useValue: { find: jest.fn(() => Promise.resolve([{ id: 'br-1' }])) } },
        { provide: getRepositoryToken(Company), useValue: { find: jest.fn(() => Promise.resolve([{ id: 'co-A' }])) } },
      ],
    }).compile();
    products = module.get(ProductsService);
    pos = module.get(PosService);
  });

  describe('alta y edición', () => {
    it.each(['16', '8', '0', 'EXENTO'])('create acepta %s', async (tasaIva) => {
      await products.create({ name: 'Cola', price: 20, tasaIva } as any, TENANT_A);
      expect(guardados[0]).toMatchObject({ tasaIva, tenantId: TENANT_A });
    });

    it('create sin tasaIva no manda el campo (la columna puede no existir todavía en una base sin migrar)', async () => {
      await products.create({ name: 'Cola', price: 20 } as any, TENANT_A);
      expect('tasaIva' in guardados[0]).toBe(false);
    });

    it('null o vacío = "usa la del negocio" (guarda null)', async () => {
      await products.create({ name: 'Cola', price: 20, tasaIva: '' } as any, TENANT_A);
      expect(guardados[0].tasaIva).toBeNull();
      await products.update('p-1', { tasaIva: null } as any, TENANT_A);
      expect(actualizados[0].patch.tasaIva).toBeNull();
    });

    it('un valor inválido es 400 y no escribe nada (create y update)', async () => {
      expect(() => products.create({ name: 'Cola', price: 20, tasaIva: '21' } as any, TENANT_A)).toThrow(BadRequestException);
      await expect(products.update('p-1', { tasaIva: 'IVA16' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      expect(guardados).toHaveLength(0);
      expect(actualizados).toHaveLength(0);
    });

    it('aislamiento de tenant: otro tenant no cambia la tasa de un producto ajeno', async () => {
      await expect(products.update('p-1', { tasaIva: '0' } as any, 'tenant-B')).rejects.toThrow('Producto no encontrado');
      expect(actualizados).toHaveLength(0);
    });
  });

  describe('importación CSV (columna iva)', () => {
    const fila = (extra: Record<string, any> = {}) => ({ nombre: 'Cola', categoria: 'Bebidas', precio: '25', ...extra });

    it('lee iva: 16 | 8 | 0 | EXENTO (sin importar mayúsculas); vacío o ausente = tasa del negocio (no manda el campo)', async () => {
      const r = await pos.importProducts(
        [fila({ nombre: 'A', iva: '8' }), fila({ nombre: 'B', iva: 'exento' }), fila({ nombre: 'C', iva: '0' }), fila({ nombre: 'D', iva: '' }), fila({ nombre: 'E' })],
        TENANT_A,
        'br-1',
      );
      expect(r.success).toBe(5);
      expect(guardados.map((p) => [p.name, p.tasaIva])).toEqual([['A', '8'], ['B', 'EXENTO'], ['C', '0'], ['D', undefined], ['E', undefined]]);
    });

    it('una tasa inválida rechaza solo esa fila', async () => {
      const r = await pos.importProducts([fila({ nombre: 'A', iva: '21' }), fila({ nombre: 'B', iva: '16' })], TENANT_A, 'br-1');
      expect(r.success).toBe(1);
      expect(r.errors[0]).toMatchObject({ row: 2 });
      expect(r.errors[0].message).toContain('iva debe ser');
    });
  });
});
