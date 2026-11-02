import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CostsService } from './costs.service';
import { CostsController } from './costs.controller';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Justifiable, JustifiableCategory } from './entities/justifiable.entity';
import { Almacen } from './entities/almacen.entity';
import { FamiliaInsumo } from './entities/familia-insumo.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

dotenv.config();

// Costos contra Postgres real (esquema temporal). Antes: insumos, almacenes, familias, recetas, lineas de receta,
// inventarios y conteos se leian, editaban y borraban por id sin mirar el tenant; busqueda, next-code e imports eran globales
// (los imports ademas dejaban filas sin negocio) y SOPORTE sin ?tenantId= listaba todos los tenants.
describe('CostsService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_costs_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: CostsService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, brA: string, famA: string, insA: string, almA: string, recA: string, itemA: string, invA: string;

  const base = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'estia',
  });
  const guardar = async (entity: any, data: any): Promise<string> => {
    const r: any = await ds.getRepository(entity).save(ds.getRepository(entity).create(data) as any);
    return r.id;
  };
  const noEncontrado = (p: Promise<any>) => expect(p).rejects.toBeInstanceOf(NotFoundException);

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [Insumo, Recipe, RecipeItem, Inventory, InventoryMovement, PhysicalCount, Justifiable, Almacen, FamiliaInsumo, Branch, Company],
    }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    brA = await guardar(Branch, { companyId: coA, name: 'Matriz A' });
    famA = await guardar(FamiliaInsumo, { tenantId: tA, nombre: 'Abarrotes A', prefijo: 'ABA' });
    insA = await guardar(Insumo, { tenantId: tA, nombre: 'Harina A', codigo: 'ABA-001', familiaId: famA, costoUnitario: 10, stockActual: 5, isActive: true });
    almA = await guardar(Almacen, { tenantId: tA, nombre: 'Bodega A' });
    recA = await guardar(Recipe, { tenantId: tA, nombre: 'Pan A', tipo: 'PRODUCTO_VENTA', rendimiento: 1, isActive: true });
    itemA = await guardar(RecipeItem, { tenantId: tA, recipeId: recA, insumoId: insA, cantidad: 2, unidadMedida: 'kg' });
    invA = await guardar(Inventory, { tenantId: tA, insumoId: insA, periodo: '2026-11', inventarioInicial: 1, entradas: 2, salidas: 0, inventarioFinal: 3 });
    await guardar(PhysicalCount, { tenantId: tA, fecha: new Date(), insumoId: insA, existenciaFisica: 5, existenciaTeorica: 5, diferencia: 0 });
    await guardar(Justifiable, { tenantId: tA, periodo: '2026-11', categoria: JustifiableCategory.ENERGETICOS, monto: 100 });

    svc = new CostsService(
      ds.getRepository(Insumo), ds.getRepository(Recipe), ds.getRepository(RecipeItem), ds.getRepository(Inventory),
      ds.getRepository(InventoryMovement), ds.getRepository(PhysicalCount), ds.getRepository(Justifiable),
      ds.getRepository(Almacen), ds.getRepository(FamiliaInsumo),
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve lo suyo', async () => {
    expect((await svc.findAllInsumos(tA)).map((i) => i.nombre)).toEqual(['Harina A']);
    expect((await svc.searchInsumos('harina', 10, tA)).length).toBe(1);
    expect((await svc.findAllAlmacenes(tA)).length).toBe(1);
    expect((await svc.findAllFamilias(tA)).length).toBe(1);
    expect((await svc.findAllRecipes(tA)).length).toBe(1);
    expect((await svc.findInventoryByPeriod(tA)).length).toBe(1);
    expect((await svc.findPhysicalCounts(tA)).length).toBe(1);
    expect((await svc.findJustificablesByPeriod('2026-11', tA)).length).toBe(1);
    expect((await svc.getRecipeCost(recA, tA)).subtotal).toBe(20);
    expect((await svc.getNextInsumoCode(famA, tA)).codigo).toBe('ABA-002');
  });

  it('listados y busqueda: B y "sin tenant" no ven nada de A', async () => {
    for (const t of [tB, undefined]) {
      expect(await svc.findAllInsumos(t)).toEqual([]);
      expect(await svc.searchInsumos('harina', 10, t)).toEqual([]);
      expect(await svc.findAllAlmacenes(t)).toEqual([]);
      expect(await svc.findAllFamilias(t)).toEqual([]);
      expect(await svc.findAllRecipes(t)).toEqual([]);
      expect(await svc.findInventoryByPeriod(t)).toEqual([]);
      expect(await svc.findInventoryMovements(t)).toEqual([]);
      expect(await svc.findPhysicalCounts(t)).toEqual([]);
      expect(await svc.findPhysicalCountsByPeriod(new Date(0), new Date(Date.now() + 1e9), t)).toEqual([]);
      expect(await svc.findJustificablesByPeriod('2026-11', t)).toEqual([]);
      expect((await svc.calculateTotalJustificables('2026-11', t)).TOTAL).toBe(0);
      expect((await svc.calculateCostOfSales(t, '2026-11')).detalles).toEqual([]);
      expect(await svc.findInventoryByInsumo(insA, '2026-11', t)).toBeNull();
    }
  });

  it('por id: recursos de A tocados por B responden 404 y nada cambia', async () => {
    await noEncontrado(svc.findOneInsumo(insA, tB));
    await noEncontrado(svc.updateInsumo(insA, { nombre: 'Hackeado' }, undefined, tB));
    await noEncontrado(svc.deleteInsumo(insA, tB));
    await noEncontrado(svc.replaceInsumo(insA, insA + 'x', tB));
    await noEncontrado(svc.getNextInsumoCode(famA, tB));
    await noEncontrado(svc.findOneAlmacen(almA, tB));
    await noEncontrado(svc.updateAlmacen(almA, { nombre: 'Hackeado' }, tB));
    await noEncontrado(svc.deleteAlmacen(almA, tB));
    await noEncontrado(svc.findOneFamilia(famA, tB));
    await noEncontrado(svc.updateFamilia(famA, { nombre: 'Hackeado' }, tB));
    await noEncontrado(svc.deleteFamilia(famA, tB));
    await noEncontrado(svc.findOneRecipe(recA, tB));
    await noEncontrado(svc.updateRecipe(recA, { nombre: 'Hackeado' }, tB));
    await noEncontrado(svc.deleteRecipe(recA, tB));
    await noEncontrado(svc.getRecipeCost(recA, tB));
    await noEncontrado(svc.findRecipeItems(recA, tB));
    await noEncontrado(svc.createRecipeItem(recA, { insumoId: insA, cantidad: 1, unidadMedida: 'kg' }, tB));
    await noEncontrado(svc.updateRecipeItem(itemA, { cantidad: 99 }, tB));
    await noEncontrado(svc.deleteRecipeItem(itemA, tB));
    await noEncontrado(svc.updateInventory(invA, { entradas: 999 }, tB));
    await noEncontrado(svc.deleteInventory(invA, tB));

    expect(await ds.getRepository(Insumo).findOneBy({ id: insA })).toMatchObject({ nombre: 'Harina A', isActive: true });
    expect(await ds.getRepository(Almacen).findOneBy({ id: almA })).toMatchObject({ nombre: 'Bodega A' });
    expect(await ds.getRepository(FamiliaInsumo).findOneBy({ id: famA })).toMatchObject({ nombre: 'Abarrotes A' });
    expect(await ds.getRepository(Recipe).findOneBy({ id: recA })).toMatchObject({ nombre: 'Pan A' });
    expect(Number((await ds.getRepository(RecipeItem).findOneBy({ id: itemA }))!.cantidad)).toBe(2);
    expect(Number((await ds.getRepository(Inventory).findOneBy({ id: invA }))!.entradas)).toBe(2);
  });

  it('altas: sin tenant 400, id del body no pisa, referencias ajenas 404, imports solo con familias/insumos propios', async () => {
    await expect(svc.createInsumo({ nombre: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createRecipe({ nombre: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createInventory({ insumoId: insA } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createJustifiable({ periodo: '2026-11', categoria: JustifiableCategory.ENERGETICOS, monto: 1 } as any)).rejects.toBeInstanceOf(BadRequestException);

    const i: any = await svc.createInsumo({ id: insA, tenantId: tB, nombre: 'Otro', costoUnitario: 1 } as any);
    expect(i.id).not.toBe(insA);
    expect(await ds.getRepository(Insumo).findOneBy({ id: insA })).toMatchObject({ tenantId: tA, nombre: 'Harina A' });

    await noEncontrado(svc.createInsumo({ tenantId: tB, nombre: 'Y', familiaId: famA } as any)); // familia de A
    await noEncontrado(svc.createAlmacen({ tenantId: tB, nombre: 'Z', sucursalId: brA } as any)); // sucursal de A
    await noEncontrado(svc.createInventory({ tenantId: tB, insumoId: insA, periodo: '2026-11' } as any));
    await noEncontrado(svc.createPhysicalCount({ tenantId: tB, fecha: new Date(), insumoId: insA, existenciaFisica: 1 }));
    expect(Number((await ds.getRepository(Insumo).findOneBy({ id: insA }))!.stockActual)).toBe(5); // el conteo de B no toco el stock de A

    // import de B con el prefijo de la familia de A: la familia no existe para B
    const r = await svc.importInsumos([{ familia: 'ABA', nombre: 'Robado', costoUnitario: '1' }], tB);
    expect(r.success).toBe(0);
    expect(r.errors[0].message).toMatch(/no existe/);
    // import de recetas de B con un insumo de A
    const rr = await svc.importRecipes([{ nombreReceta: 'Copia', nombreInsumo: 'Harina A', cantidad: '1', porciones: '1' }], tB);
    expect(rr.success).toBe(0);
    await expect(svc.importInsumos([], undefined)).rejects.toBeInstanceOf(BadRequestException);

    // import valido de A: las filas quedan con su tenant
    const ok = await svc.importInsumos([{ familia: 'ABA', nombre: 'Azucar A', costoUnitario: '3' }], tA);
    expect(ok.success).toBe(1);
    expect(await ds.getRepository(Insumo).findOneBy({ nombre: 'Azucar A' })).toMatchObject({ tenantId: tA });
  });

  it('lineas de receta: no se puede enlazar un insumo ni una receta ajena', async () => {
    const recB = await guardar(Recipe, { tenantId: tB, nombre: 'Pan B', tipo: 'PRODUCTO_VENTA', rendimiento: 1, isActive: true });
    await noEncontrado(svc.createRecipeItem(recB, { insumoId: insA, cantidad: 1, unidadMedida: 'kg' }, tB));
    await noEncontrado(svc.createRecipeItem(recB, { componentRecipeId: recA, cantidad: 1, unidadMedida: 'pz' }, tB));
    // el negocio de la linea sale de la receta aunque el body diga otro
    const ok: any = await svc.createRecipeItem(recA, { insumoId: insA, cantidad: 1, unidadMedida: 'kg', tenantId: tB } as any, tA);
    expect(ok.tenantId).toBe(tA);
  });

  it('A sigue operando con lo suyo y SOPORTE (sin tenant) opera por id', async () => {
    expect((await svc.updateInsumo(insA, { nombre: 'Harina A2' }, undefined, tA))!.nombre).toBe('Harina A2');
    expect((await svc.findOneInsumo(insA, undefined)).id).toBe(insA); // SOPORTE: por id sin acotar
    const pc: any = await svc.createPhysicalCount({ tenantId: tA, fecha: new Date(), insumoId: insA, existenciaFisica: 7 });
    expect(Number(pc.diferencia)).toBe(2);
  });

  it('controlador: token sin tenant que no es SOPORTE 403; SOPORTE usa ?tenantId=; body.tenantId ignorado', async () => {
    const service: any = {
      findAllInsumos: jest.fn().mockResolvedValue([]),
      createInventory: jest.fn().mockResolvedValue({}),
      createJustifiable: jest.fn().mockResolvedValue({}),
    };
    const ctrl = new CostsController(service);
    const adminA = { user: { roleCode: 'ADMIN', tenantId: tA }, query: {} };
    expect(() => ctrl.findAllInsumos(tB, undefined, { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
    ctrl.findAllInsumos(tB, undefined, adminA);
    expect(service.findAllInsumos.mock.calls[0][0]).toBe(tA); // el query se ignora con tenant en el token
    ctrl.findAllInsumos(tB, undefined, { user: { roleCode: 'SOPORTE' } });
    expect(service.findAllInsumos.mock.calls[1][0]).toBe(tB);
    await ctrl.createInventory({ tenantId: tB, insumoId: insA }, adminA);
    expect(service.createInventory.mock.calls[0][0].tenantId).toBe(tA);
    await ctrl.createJustifiable({ tenantId: tB, periodo: '2026-11' }, adminA);
    expect(service.createJustifiable.mock.calls[0][0].tenantId).toBe(tA);
    await expect(ctrl.createJustifiable({ tenantId: tB }, { user: { roleCode: 'SOPORTE' }, query: {} })).rejects.toBeInstanceOf(BadRequestException);
  });
});
