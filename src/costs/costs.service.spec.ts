import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CostsService } from './costs.service';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Justifiable } from './entities/justifiable.entity';
import { Almacen } from './entities/almacen.entity';
import { FamiliaInsumo } from './entities/familia-insumo.entity';

// Ronda de seguimiento (arquitectura): captura el comportamiento OBSERVABLE de
// CostsService.costoUnitarioInsumo() antes de extraer la caminata de reemplazadoPorId a
// insumo-resolution.ts (compartida con sales.service.ts/products.service.ts). Estas pruebas
// se corrieron primero contra la implementación original (duplicada) — verdes — y deben
// seguir verdes idénticas después del refactor, sin cambiar ni un mensaje de error.
function buildInsumo(overrides: Partial<Insumo> = {}): Insumo {
  return {
    id: 'insumo-1',
    nombre: 'Insumo de prueba',
    isActive: true,
    reemplazadoPorId: null,
    costoUnitario: 10,
    ...overrides,
  } as Insumo;
}

describe('CostsService.costoUnitarioInsumo() — resolución de cadena de reemplazo', () => {
  let service: CostsService;
  let insumosRepo: { findOne: jest.Mock; manager: { findOne: jest.Mock } };

  beforeEach(async () => {
    // findOne y manager.findOne comparten el mismo mock a propósito: costoUnitarioInsumo()
    // debe seguir viendo el mismo resultado sin importar si internamente lee por
    // this.insumosRepo.findOne() (repo directo) o this.insumosRepo.manager.findOne() (mismo
    // manager no-transaccional) — son equivalentes en TypeORM real (Repository.findOne()
    // delega en this.manager.findOne() bajo el capó), la prueba no debe atarse a cuál de los
    // dos usa la implementación.
    const findOne = jest.fn();
    insumosRepo = { findOne, manager: { findOne } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostsService,
        { provide: getRepositoryToken(Insumo), useValue: insumosRepo },
        { provide: getRepositoryToken(Recipe), useValue: {} },
        { provide: getRepositoryToken(RecipeItem), useValue: {} },
        { provide: getRepositoryToken(Inventory), useValue: {} },
        { provide: getRepositoryToken(InventoryMovement), useValue: {} },
        { provide: getRepositoryToken(PhysicalCount), useValue: {} },
        { provide: getRepositoryToken(Justifiable), useValue: {} },
        { provide: getRepositoryToken(Almacen), useValue: {} },
        { provide: getRepositoryToken(FamiliaInsumo), useValue: {} },
      ],
    }).compile();

    service = module.get<CostsService>(CostsService);
  });

  function callCostoUnitarioInsumo(insumo: Insumo) {
    return (service as any).costoUnitarioInsumo(insumo);
  }

  it('insumo activo: devuelve su propio costoUnitario sin buscar reemplazo', async () => {
    const insumo = buildInsumo({ costoUnitario: 42 });
    const costo = await callCostoUnitarioInsumo(insumo);
    expect(costo).toBe(42);
    expect(insumosRepo.findOne).not.toHaveBeenCalled();
  });

  it('insumo inactivo con reemplazo activo: resuelve al costo del reemplazo', async () => {
    const reemplazo = buildInsumo({ id: 'insumo-2', costoUnitario: 99 });
    insumosRepo.findOne.mockResolvedValueOnce(reemplazo);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'insumo-2' });

    const costo = await callCostoUnitarioInsumo(insumo);

    expect(costo).toBe(99);
    // Firma de manager.findOne(Entity, opts) — la implementación lee por
    // this.insumosRepo.manager, no por this.insumosRepo directo (ver nota arriba).
    expect(insumosRepo.findOne).toHaveBeenCalledWith(Insumo, { where: { id: 'insumo-2' } });
  });

  it('cadena de dos saltos (inactivo -> inactivo -> activo): resuelve al final de la cadena', async () => {
    const activo = buildInsumo({ id: 'insumo-3', costoUnitario: 7 });
    const intermedio = buildInsumo({ id: 'insumo-2', isActive: false, reemplazadoPorId: 'insumo-3' });
    insumosRepo.findOne.mockResolvedValueOnce(intermedio).mockResolvedValueOnce(activo);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'insumo-2' });

    const costo = await callCostoUnitarioInsumo(insumo);
    expect(costo).toBe(7);
  });

  it('inactivo sin reemplazo configurado: lanza Error con mensaje exacto', async () => {
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: null, nombre: 'Queso' });
    await expect(callCostoUnitarioInsumo(insumo)).rejects.toThrow(
      'El insumo "Queso" está inactivo y no tiene reemplazo configurado',
    );
  });

  it('reemplazo apunta a un insumo que no existe: lanza Error con mensaje exacto', async () => {
    insumosRepo.findOne.mockResolvedValueOnce(null);
    const insumo = buildInsumo({ isActive: false, reemplazadoPorId: 'insumo-fantasma' });
    await expect(callCostoUnitarioInsumo(insumo)).rejects.toThrow(
      'El insumo de reemplazo insumo-fantasma no existe',
    );
  });

  it('ciclo en la cadena de reemplazo: lanza Error de referencia circular', async () => {
    const a = buildInsumo({ id: 'a', isActive: false, reemplazadoPorId: 'b' });
    const b = buildInsumo({ id: 'b', isActive: false, reemplazadoPorId: 'a' });
    insumosRepo.findOne.mockResolvedValueOnce(b).mockResolvedValueOnce(a);

    await expect(callCostoUnitarioInsumo(a)).rejects.toThrow(/Referencia circular/);
  });
});
