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
