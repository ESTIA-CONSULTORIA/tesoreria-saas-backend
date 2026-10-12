import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { PlanMembresia } from '../membresias/entities/plan-membresia.entity';

// El catálogo del POS no muestra los productos que son planes de membresía (se cobran desde Membresías, con socio).
const A = 'tenant-A';
const B = 'tenant-B';

describe('ProductsService.findAll — productos de planes de membresía', () => {
  let service: ProductsService;
  let planesFind: jest.Mock;
  let productsFind: jest.Mock;
  const PRODUCTOS = [
    { id: 'p-agua', tenantId: A, name: 'Agua', type: 'SERVICE', insumoId: null },
    { id: 'p-plan-mensual', tenantId: A, name: 'Membresía: Mensual', type: 'SIMPLE', insumoId: null },
    { id: 'p-plan-anual', tenantId: A, name: 'Membresía: Anual', type: 'SIMPLE', insumoId: null },
    { id: 'p-b', tenantId: B, name: 'Membresía: Del otro', type: 'SIMPLE', insumoId: null },
  ];

  async function armar(conPlanes = true) {
    productsFind = jest.fn(({ where }: any) => Promise.resolve(PRODUCTOS.filter((p) => !where.tenantId || p.tenantId === where.tenantId).map((p) => ({ ...p }))));
    planesFind = jest.fn(({ where }: any) =>
      Promise.resolve(
        [
          { tenantId: A, productId: 'p-plan-mensual' },
          { tenantId: A, productId: 'p-plan-anual' },
          { tenantId: B, productId: 'p-b' },
        ].filter((p) => p.tenantId === where.tenantId),
      ),
    );
    const providers: any[] = [
      ProductsService,
      { provide: getRepositoryToken(Product), useValue: { find: productsFind } },
      { provide: getRepositoryToken(Insumo), useValue: { findOne: jest.fn(), manager: { findOne: jest.fn() } } },
      { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn() } },
    ];
    if (conPlanes) providers.push({ provide: getRepositoryToken(PlanMembresia), useValue: { find: planesFind } });
    const m: TestingModule = await Test.createTestingModule({ providers }).compile();
    service = m.get(ProductsService);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  }

  const nombres = (r: any[]) => r.map((p) => p.name);

  it('oculta los productos de los planes del negocio y deja los demás', async () => {
    await armar();
    expect(nombres(await service.findAll(undefined, A))).toEqual(['Agua']);
  });

  it('aislamiento: los planes de otro negocio no ocultan nada del mío, y cada negocio solo oculta lo suyo', async () => {
    await armar();
    expect(nombres(await service.findAll(undefined, B))).toEqual([]); // su único producto es de su plan
    expect(planesFind).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: B } }));
    expect(nombres(await service.findAll(undefined, A))).toEqual(['Agua']);
  });

  it('si la consulta de planes falla (tabla aún sin migrar), el catálogo sigue completo y NO da error', async () => {
    await armar();
    planesFind.mockRejectedValue(new Error('relation "planes_membresia" does not exist'));
    expect(nombres(await service.findAll(undefined, A))).toEqual(['Agua', 'Membresía: Mensual', 'Membresía: Anual']);
  });

  it('sin el módulo de membresías (repositorio ausente) no oculta nada', async () => {
    await armar(false);
    expect(nombres(await service.findAll(undefined, A))).toEqual(['Agua', 'Membresía: Mensual', 'Membresía: Anual']);
  });

  it('sin tenantId (SOPORTE) no consulta planes ni oculta', async () => {
    await armar();
    await service.findAll();
    expect(planesFind).not.toHaveBeenCalled();
  });
});

// Regresión en producción (7322dd3): al mostrar los productos sin sucursal (NULL = compartido), un producto del demo con
// insumoId 'insumo-2' (no UUID) hizo que Postgres lanzara "invalid input syntax for type uuid" y GET /pos/products diera 500.
describe('ProductsService.findAll — insumoId heredado que no es UUID', () => {
  const UUID = '11111111-2222-3333-4444-555555555555';
  let service: ProductsService;
  let insumoFindOne: jest.Mock;
  let productsFind: jest.Mock;

  async function armar(productos: any[]) {
    productsFind = jest.fn().mockResolvedValue(productos);
    insumoFindOne = jest.fn(({ where }: any) => {
      if (!/^[0-9a-f-]{36}$/i.test(where.id)) return Promise.reject(new Error(`invalid input syntax for type uuid: "${where.id}"`));
      return Promise.resolve({ id: where.id, stockActual: 7, stockMinimo: 2, isActive: true });
    });
    const m = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: { find: productsFind } },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: insumoFindOne, manager: { findOne: jest.fn() } } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: jest.fn().mockResolvedValue({ items: [{ insumoId: 'insumo-9', cantidad: 1 }] }) } },
      ],
    }).compile();
    service = m.get(ProductsService);
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  }

  const catalogo = () => [
    { id: 'p1', tenantId: A, name: 'Legacy', type: 'SIMPLE', insumoId: 'insumo-2', branchId: null },
    { id: 'p2', tenantId: A, name: 'Real', type: 'SIMPLE', insumoId: UUID, branchId: null },
    { id: 'p3', tenantId: A, name: 'Receta', type: 'PREPARADO', recipeId: 'r1', branchId: null },
    { id: 'p4', tenantId: A, name: 'Servicio', type: 'SERVICE', branchId: null },
  ];

  it('ADMIN sin sucursal: no da 500; el producto legado queda con stock 0 y los demás conservan el suyo', async () => {
    await armar(catalogo());
    const r: any[] = await service.findAll(undefined, A);
    expect(r.map((p) => p.name)).toEqual(['Legacy', 'Real', 'Receta', 'Servicio']);
    expect(r.find((p) => p.name === 'Legacy').stock).toBe(0);
    expect(r.find((p) => p.name === 'Real').stock).toBe(7);
    expect(r.find((p) => p.name === 'Receta').stock).toBe(0);
    expect(insumoFindOne).not.toHaveBeenCalledWith({ where: { id: 'insumo-2' } });
  });

  it('con X-Branch-Id: incluye los NULL compartidos, acotado al tenant, y tampoco da 500', async () => {
    await armar(catalogo());
    const r = await service.findAll('branch-1', A);
    expect(r).toHaveLength(4);
    expect(productsFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: [{ tenantId: A, branchId: 'branch-1' }, expect.objectContaining({ tenantId: A })] }),
    );
  });
});
