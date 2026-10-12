import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';

// insumoId / recipeId de un producto: UUID válido y existente EN EL TENANT, o 400 claro. Antes se guardaba cualquier texto
// ('insumo-2') y GET /pos/products daba 500.
const A = 'tenant-A';
const B = 'tenant-B';
const INSUMO_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const INSUMO_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const RECETA_A = 'aaaaaaaa-0000-4000-8000-000000000004';
const RECETA_B = 'bbbbbbbb-0000-4000-8000-000000000003';

describe('ProductsService — validación de insumoId y recipeId', () => {
  let service: ProductsService;
  let save: jest.Mock;
  let update: jest.Mock;

  beforeEach(async () => {
    save = jest.fn((x) => Promise.resolve({ id: 'nuevo', ...x }));
    update = jest.fn().mockResolvedValue(undefined);
    const insumos = [{ id: INSUMO_A, tenantId: A }, { id: INSUMO_B, tenantId: B }];
    const recetas = [{ id: RECETA_A, tenantId: A }, { id: RECETA_B, tenantId: B }];
    const buscar = (lista: any[]) => jest.fn(({ where }: any) => Promise.resolve(lista.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null));
    const m = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            create: (x: any) => x,
            save,
            update,
            manager: { findOne: jest.fn() },
            findOne: jest.fn(({ where }: any) => Promise.resolve(where.id === 'p-a' ? { id: 'p-a', tenantId: A } : null)),
          },
        },
        { provide: getRepositoryToken(Insumo), useValue: { findOne: buscar(insumos), manager: {} } },
        { provide: getRepositoryToken(Recipe), useValue: { findOne: buscar(recetas) } },
      ],
    }).compile();
    service = m.get(ProductsService);
  });

  describe('create', () => {
    it('acepta un insumo real del tenant', async () => {
      await service.create({ name: 'Agua', type: 'SIMPLE', insumoId: INSUMO_A } as any, A);
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: A, insumoId: INSUMO_A }));
    });

    it('acepta una receta real del tenant', async () => {
      await service.create({ name: 'Hamburguesa', type: 'PREPARADO', recipeId: RECETA_A } as any, A);
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ recipeId: RECETA_A }));
    });

    it('sin insumoId ni recipeId, o vacíos, guarda sin vínculo (el campo vacío pasa a null)', async () => {
      await service.create({ name: 'Servicio', type: 'SERVICE' } as any, A);
      await service.create({ name: 'Otro', type: 'SIMPLE', insumoId: '', recipeId: null } as any, A);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1][0]).toEqual(expect.objectContaining({ insumoId: null, recipeId: null }));
    });

    it("rechaza 'insumo-2' (no UUID) con 400 y no guarda", async () => {
      await expect(service.create({ name: 'X', insumoId: 'insumo-2' } as any, A)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create({ name: 'X', insumoId: 'insumo-2' } as any, A)).rejects.toThrow(/insumo seleccionado no es válido/);
      expect(save).not.toHaveBeenCalled();
    });

    it("rechaza 'receta-1' (no UUID) con 400", async () => {
      await expect(service.create({ name: 'X', type: 'PREPARADO', recipeId: 'receta-1' } as any, A)).rejects.toThrow(/receta seleccionado no es válido/);
      expect(save).not.toHaveBeenCalled();
    });

    it('rechaza un UUID válido que no existe', async () => {
      await expect(service.create({ name: 'X', insumoId: '99999999-0000-4000-8000-000000000009' } as any, A)).rejects.toThrow(/no existe en este negocio/);
      expect(save).not.toHaveBeenCalled();
    });

    it('aislamiento: un insumo o receta de OTRO tenant se rechaza como inexistente', async () => {
      await expect(service.create({ name: 'X', insumoId: INSUMO_B } as any, A)).rejects.toThrow(/no existe en este negocio/);
      await expect(service.create({ name: 'X', recipeId: RECETA_B } as any, A)).rejects.toThrow(/no existe en este negocio/);
      expect(save).not.toHaveBeenCalled();
      // y el tenant B sí puede usar los suyos
      await service.create({ name: 'Y', insumoId: INSUMO_B } as any, B);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('rechaza un valor que no es texto', async () => {
      await expect(service.create({ name: 'X', insumoId: 5 } as any, A)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it("rechaza 'insumo-2' y no actualiza", async () => {
      await expect(service.update('p-a', { insumoId: 'insumo-2' } as any, A)).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('aislamiento: no permite vincular el insumo de otro tenant', async () => {
      await expect(service.update('p-a', { insumoId: INSUMO_B } as any, A)).rejects.toThrow(/no existe en este negocio/);
      expect(update).not.toHaveBeenCalled();
    });

    it('acepta un insumo real; editar solo el nombre no valida ni toca los vínculos', async () => {
      await service.update('p-a', { insumoId: INSUMO_A } as any, A);
      expect(update).toHaveBeenLastCalledWith('p-a', expect.objectContaining({ insumoId: INSUMO_A }));
      await service.update('p-a', { name: 'Nuevo' } as any, A);
      const cuerpo = update.mock.calls[1][1];
      expect(cuerpo).not.toHaveProperty('insumoId');
      expect(cuerpo).not.toHaveProperty('recipeId');
    });

    it('SOPORTE (sin tenantId en el JWT) valida contra el tenant del producto', async () => {
      await expect(service.update('p-a', { insumoId: INSUMO_B } as any, undefined)).rejects.toThrow(/no existe en este negocio/);
      await service.update('p-a', { insumoId: INSUMO_A } as any, undefined);
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe('opcionesStock', () => {
    it('sin tenant devuelve vacío', async () => {
      expect(await service.opcionesStock(undefined)).toEqual({ insumos: [], recetas: [] });
    });
  });
});
