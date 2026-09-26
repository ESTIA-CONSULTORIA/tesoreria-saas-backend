import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { InsumoAlertsService } from './insumo-alerts.service';

// Ronda de seguimiento (arquitectura): captura el comportamiento OBSERVABLE de
// SalesService.resolveActiveInsumo() antes de extraer la caminata de reemplazadoPorId a
// insumo-resolution.ts (compartida con costs.service.ts/products.service.ts). Corridas
// primero contra la implementación original — verdes — deben seguir idénticas después.
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

describe('SalesService.resolveActiveInsumo() — resolución de cadena de reemplazo', () => {
  let service: SalesService;
  let insumoRepo: { findOne: jest.Mock; manager: { findOne: jest.Mock } };
  let managerFindOne: jest.Mock;

  beforeEach(async () => {
    // findOne y manager.findOne comparten el mismo mock a propósito (ver misma nota en
    // costs.service.spec.ts) — equivalentes en TypeORM real, la prueba "sin manager" no debe
    // atarse a cuál de los dos usa la implementación.
    const findOne = jest.fn();
    insumoRepo = { findOne, manager: { findOne } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(Insumo), useValue: insumoRepo },
        { provide: getRepositoryToken(TenantSetting), useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: InsumoAlertsService, useValue: {} },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    managerFindOne = jest.fn();
  });

  function callResolve(insumo: Insumo, manager?: any) {
    return (service as any).resolveActiveInsumo(insumo, manager);
  }

  it('insumo activo: se devuelve a sí mismo sin buscar reemplazo (sin manager)', async () => {
    const insumo = buildInsumo();
    const resuelto = await callResolve(insumo);
    expect(resuelto).toBe(insumo);
    expect(insumoRepo.findOne).not.toHaveBeenCalled();
  });

  it('sin manager: usa this.insumoRepo para leer el reemplazo', async () => {
    const reemplazo = buildInsumo({ id: 'insumo-2' });
    insumoRepo.findOne.mockResolvedValueOnce(reemplazo);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'insumo-2' });

    const resuelto = await callResolve(insumo);

    expect(resuelto).toBe(reemplazo);
    // Firma de manager.findOne(Entity, opts) — la implementación lee por
    // this.insumoRepo.manager, no por this.insumoRepo directo (ver nota arriba).
    expect(insumoRepo.findOne).toHaveBeenCalledWith(Insumo, { where: { id: 'insumo-2' } });
  });

  it('con manager (dentro de la transacción): lee el reemplazo por el manager, no por this.insumoRepo', async () => {
    const reemplazo = buildInsumo({ id: 'insumo-2' });
    managerFindOne.mockResolvedValueOnce(reemplazo);
    const manager = { findOne: managerFindOne };
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'insumo-2' });

    const resuelto = await callResolve(insumo, manager);

    expect(resuelto).toBe(reemplazo);
    expect(managerFindOne).toHaveBeenCalledWith(Insumo, { where: { id: 'insumo-2' } });
    expect(insumoRepo.findOne).not.toHaveBeenCalled();
  });

  it('inactivo sin reemplazo configurado: BadRequestException con mensaje exacto', async () => {
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: null, nombre: 'Queso' });
    await expect(callResolve(insumo)).rejects.toThrow(
      'El insumo "Queso" está inactivo y no tiene reemplazo configurado — no se puede vender.',
    );
  });

  it('reemplazo apunta a un insumo que no existe: BadRequestException con mensaje exacto', async () => {
    insumoRepo.findOne.mockResolvedValueOnce(null);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'x', nombre: 'Queso' });
    await expect(callResolve(insumo)).rejects.toThrow('El insumo de reemplazo de "Queso" no existe.');
  });

  it('ciclo en la cadena de reemplazo: Error de referencia circular', async () => {
    const a = buildInsumo({ id: 'a', isActive: false, reemplazadoPorId: 'b' });
    const b = buildInsumo({ id: 'b', isActive: false, reemplazadoPorId: 'a' });
    insumoRepo.findOne.mockResolvedValueOnce(b).mockResolvedValueOnce(a);

    await expect(callResolve(a)).rejects.toThrow(/Referencia circular/);
  });
});
