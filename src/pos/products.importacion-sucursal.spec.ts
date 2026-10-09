import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosConfig } from './entities/pos-config.entity';
import { Product } from './entities/product.entity';
import { PosCategory } from './entities/category.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

// Importación CSV de productos con DOS sucursales: cada producto queda en la sucursal elegida (branchId), la categoría se
// busca solo en esa sucursal (el mismo nombre existe en las dos) y estacionPreparacion se fija desde la columna `estacion`.
const TENANT_A = 'tenant-A';

describe('PosService.importProducts() — sucursal elegida y estación', () => {
  let service: PosService;
  let creados: any[];
  let sucursales: Array<{ id: string }>;

  // Misma categoría "Bebidas" en las dos sucursales (ids distintos); "Postres" solo en la 2; una categoría de otro tenant.
  const CATEGORIAS = [
    { id: 'cat-1-bebidas', name: 'Bebidas', branchId: 'br-1', isActive: true },
    { id: 'cat-2-bebidas', name: 'Bebidas', branchId: 'br-2', isActive: true },
    { id: 'cat-2-postres', name: 'Postres', branchId: 'br-2', isActive: true },
    { id: 'cat-B-bebidas', name: 'Bebidas', branchId: 'br-B', isActive: true },
  ];

  beforeEach(async () => {
    creados = [];
    sucursales = [{ id: 'br-1' }, { id: 'br-2' }];
    const productRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => { creados.push(d); return Promise.resolve(d); }),
    };
    const companyRepo = { find: jest.fn(() => Promise.resolve([{ id: 'co-A' }])) };
    const branchRepo = { find: jest.fn(() => Promise.resolve(sucursales)) };
    const categoryRepo = {
      find: jest.fn(({ where }) => {
        const ids: string[] = where.branchId?.value ?? [];
        return Promise.resolve(CATEGORIAS.filter((c) => c.isActive && ids.includes(c.branchId)));
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

  const fila = (extra: Record<string, any> = {}) => ({ nombre: 'Cola', categoria: 'Bebidas', precio: '25', ...extra });

  it('a la sucursal 1: branchId = br-1 y la categoría es la de br-1, no la homónima de br-2', async () => {
    const r = await service.importProducts([fila()], TENANT_A, 'br-1');
    expect(r).toMatchObject({ success: 1, errors: [], branchId: 'br-1' });
    expect(creados[0]).toMatchObject({ name: 'Cola', price: 25, branchId: 'br-1', categoryId: 'cat-1-bebidas', tenantId: TENANT_A });
  });

  it('a la sucursal 2: branchId = br-2 y la categoría es la de br-2', async () => {
    await service.importProducts([fila()], TENANT_A, 'br-2');
    expect(creados[0]).toMatchObject({ branchId: 'br-2', categoryId: 'cat-2-bebidas' });
  });

  it('una categoría que solo existe en la otra sucursal no se usa: la fila da error y no se crea', async () => {
    const r = await service.importProducts([fila({ nombre: 'Flan', categoria: 'Postres' })], TENANT_A, 'br-1');
    expect(r.success).toBe(0);
    expect(r.errors).toEqual([{ row: 2, message: 'Categoría "Postres" no existe' }]);
    expect(creados).toHaveLength(0);
    // en la sucursal 2 la misma fila sí entra
    const ok = await service.importProducts([fila({ nombre: 'Flan', categoria: 'Postres' })], TENANT_A, 'br-2');
    expect(ok.success).toBe(1);
    expect(creados[0]).toMatchObject({ categoryId: 'cat-2-postres', branchId: 'br-2' });
  });

  it('con dos sucursales y sin elegir: 400 y no se crea nada', async () => {
    await expect(service.importProducts([fila()], TENANT_A)).rejects.toThrow(BadRequestException);
    await expect(service.importProducts([fila()], TENANT_A, '   ')).rejects.toThrow('Indica la sucursal');
    expect(creados).toHaveLength(0);
  });

  it('con una sola sucursal y sin elegir: usa esa', async () => {
    sucursales = [{ id: 'br-1' }];
    const r = await service.importProducts([fila()], TENANT_A);
    expect(r.branchId).toBe('br-1');
    expect(creados[0]).toMatchObject({ branchId: 'br-1', categoryId: 'cat-1-bebidas' });
  });

  it('una sucursal que no es del tenant (otro tenant) se rechaza: 400 y no se crea nada', async () => {
    await expect(service.importProducts([fila()], TENANT_A, 'br-B')).rejects.toThrow('Sucursal no encontrada');
    expect(creados).toHaveLength(0);
  });

  describe('estacionPreparacion', () => {
    it('COCINA y BARRA se fijan (sin importar mayúsculas); vacío = sin estación y se cuenta', async () => {
      const r = await service.importProducts(
        [
          fila({ nombre: 'Tacos', estacion: 'COCINA' }),
          fila({ nombre: 'Mojito', estacion: 'barra' }),
          fila({ nombre: 'Botella de agua', estacion: '' }),
          fila({ nombre: 'Sin columna' }),
        ],
        TENANT_A,
        'br-1',
      );
      expect(r).toMatchObject({ success: 4, errors: [], sinEstacion: 2 });
      expect(creados.map((p) => [p.name, p.estacionPreparacion])).toEqual([
        ['Tacos', 'COCINA'],
        ['Mojito', 'BARRA'],
        ['Botella de agua', undefined],
        ['Sin columna', undefined],
      ]);
    });

    it('una estación inválida rechaza solo esa fila (número de fila del CSV) y el resto entra', async () => {
      const r = await service.importProducts(
        [fila({ nombre: 'Tacos', estacion: 'COCINA' }), fila({ nombre: 'Raro', estacion: 'MESA' }), fila({ nombre: 'Café', estacion: 'BARRA' })],
        TENANT_A,
        'br-2',
      );
      expect(r.success).toBe(2);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatchObject({ row: 3 });
      expect(r.errors[0].message).toContain('COCINA o BARRA');
      expect(creados.map((p) => p.name)).toEqual(['Tacos', 'Café']);
    });
  });
});
