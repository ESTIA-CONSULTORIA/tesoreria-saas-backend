import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';

// Ronda de seguimiento (arquitectura): captura el comportamiento OBSERVABLE de
// ProductsService.resolveActiveInsumoSafe() antes de extraer la caminata de reemplazadoPorId
// a insumo-resolution.ts (compartida con sales.service.ts/costs.service.ts). Corridas primero
// contra la implementación original — verdes — deben seguir idénticas después. A diferencia
// de las otras dos, esta variante nunca lanza: loggea y devuelve null.
function buildInsumo(overrides: Partial<Insumo> = {}): Insumo {
  return {
    id: 'insumo-1',
    nombre: 'Insumo de prueba',
    isActive: true,
    reemplazadoPorId: null,
    costoUnitario: 10,
    stockActual: 100,
    stockMinimo: 5,
    ...overrides,
  } as Insumo;
}

describe('ProductsService.resolveActiveInsumoSafe() — resolución de cadena de reemplazo', () => {
  let service: ProductsService;
  let insumosRepo: { findOne: jest.Mock; manager: { findOne: jest.Mock } };
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    // findOne y manager.findOne comparten el mismo mock a propósito (ver misma nota en
    // costs.service.spec.ts) — equivalentes en TypeORM real, la prueba no debe atarse a cuál
    // de los dos usa la implementación.
    const findOne = jest.fn();
    insumosRepo = { findOne, manager: { findOne } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(Insumo), useValue: insumosRepo },
        { provide: getRepositoryToken(Recipe), useValue: {} },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
  });

  function callResolveSafe(insumo: Insumo) {
    return (service as any).resolveActiveInsumoSafe(insumo);
  }

  it('insumo activo: se devuelve a sí mismo sin buscar reemplazo', async () => {
    const insumo = buildInsumo();
    const resuelto = await callResolveSafe(insumo);
    expect(resuelto).toBe(insumo);
    expect(insumosRepo.findOne).not.toHaveBeenCalled();
  });

  it('inactivo con reemplazo activo: resuelve al reemplazo', async () => {
    const reemplazo = buildInsumo({ id: 'insumo-2' });
    insumosRepo.findOne.mockResolvedValueOnce(reemplazo);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'insumo-2' });

    const resuelto = await callResolveSafe(insumo);
    expect(resuelto).toBe(reemplazo);
  });

  it('inactivo sin reemplazo configurado: no lanza, loggea warning y devuelve null', async () => {
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: null, id: 'insumo-x', nombre: 'Queso' });
    const resuelto = await callResolveSafe(insumo);

    expect(resuelto).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('Insumo "Queso" (insumo-x) está inactivo sin reemplazo configurado');
  });

  it('reemplazo apunta a un insumo que no existe: no lanza, loggea warning y devuelve null', async () => {
    insumosRepo.findOne.mockResolvedValueOnce(null);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'fantasma', nombre: 'Queso' });

    const resuelto = await callResolveSafe(insumo);

    expect(resuelto).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('El insumo de reemplazo de "Queso" (fantasma) no existe');
  });

  it('ciclo en la cadena de reemplazo: no lanza, loggea warning de referencia circular y devuelve null', async () => {
    const a = buildInsumo({ id: 'a', isActive: false, reemplazadoPorId: 'b' });
    const b = buildInsumo({ id: 'b', isActive: false, reemplazadoPorId: 'a' });
    insumosRepo.findOne.mockResolvedValueOnce(b).mockResolvedValueOnce(a);

    const resuelto = await callResolveSafe(a);

    expect(resuelto).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Referencia circular'));
  });
});
