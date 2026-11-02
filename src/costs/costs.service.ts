import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { Repository, Between, EntityManager } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { Inventory } from './entities/inventory.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Justifiable, JustifiableCategory } from './entities/justifiable.entity';
import { Almacen } from './entities/almacen.entity';
import { FamiliaInsumo } from './entities/familia-insumo.entity';
import { resolveActiveInsumoChain } from './insumo-resolution';

@Injectable()
export class CostsService {
  constructor(
    @InjectRepository(Insumo)
    private insumosRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private recipesRepo: Repository<Recipe>,
    @InjectRepository(RecipeItem)
    private recipeItemsRepo: Repository<RecipeItem>,
    @InjectRepository(Inventory)
    private inventoryRepo: Repository<Inventory>,
    @InjectRepository(InventoryMovement)
    private inventoryMovementRepo: Repository<InventoryMovement>,
    @InjectRepository(PhysicalCount)
    private physicalCountRepo: Repository<PhysicalCount>,
    @InjectRepository(Justifiable)
    private justifiableRepo: Repository<Justifiable>,
    @InjectRepository(Almacen)
    private almacenesRepo: Repository<Almacen>,
    @InjectRepository(FamiliaInsumo)
    private familiasRepo: Repository<FamiliaInsumo>,
  ) {}

  // --- Aislamiento por tenant ---
  // tenantId llega SIEMPRE del token (tenantParaListar / tenantParaEscribir / tenantDeSesion en el controlador); en las
  // operaciones por id undefined solo ocurre con SOPORTE. Un recurso de otro tenant responde 404 igual que uno inexistente.
  private dueno(id: string, tenantId?: string): any {
    return tenantId ? { id, tenantId } : { id };
  }

  private async propio<T extends object>(repo: Repository<T>, id: string, tenantId: string | undefined, mensaje: string): Promise<T> {
    const r = id ? await repo.findOne({ where: this.dueno(id, tenantId) as any }) : null;
    if (!r) throw new NotFoundException(mensaje);
    return r;
  }

  private exigirTenant(tenantId?: string): string {
    if (!tenantId) throw new BadRequestException('Falta el negocio');
    return tenantId;
  }

  private async sucursalDelTenant(branchId: string, tenantId: string): Promise<boolean> {
    const n = await this.almacenesRepo.manager
      .getRepository(Branch)
      .createQueryBuilder('b')
      .innerJoin(Company, 'c', 'c.id::text = b."companyId"::text')
      .where('b.id::text = :branchId', { branchId })
      .andWhere('c."tenantId"::text = :tenantId', { tenantId })
      .getCount();
    return n > 0;
  }

  private async validarRefs(tenantId: string, r: { insumoId?: string; familiaId?: string; sucursalId?: string; branchId?: string }) {
    if (r.insumoId) await this.propio(this.insumosRepo, r.insumoId, tenantId, 'Insumo no encontrado');
    if (r.familiaId) await this.propio(this.familiasRepo, r.familiaId, tenantId, 'Familia no encontrada');
    for (const b of [r.sucursalId, r.branchId]) {
      if (b && !(await this.sucursalDelTenant(b, tenantId))) throw new NotFoundException('Sucursal no encontrada');
    }
  }

  // Insumos
  findAllInsumos(tenantId?: string, categoriaId?: string) {
    if (!tenantId) return Promise.resolve([]); // sin tenant (SOPORTE sin ?tenantId=) nunca se listan todos
    const where: any = { tenantId };
    if (categoriaId) where.categoriaId = categoriaId;

    return this.insumosRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  async searchInsumos(search: string, limit: number = 10, tenantId?: string) {
    if (!tenantId || !search || search.length < 2) {
      return [];
    }

    const query = this.insumosRepo.createQueryBuilder('insumo');
    
    query.where('insumo.tenantId = :tenantId', { tenantId });
    query.andWhere(
      '(LOWER(insumo.codigo) LIKE LOWER(:search) OR LOWER(insumo.nombre) LIKE LOWER(:search) OR LOWER(insumo.descripcion) LIKE LOWER(:search))',
      { search: `%${search}%` }
    );

    query.andWhere('insumo.isActive = :isActive', { isActive: true });

    query.orderBy('insumo.nombre', 'ASC');
    query.limit(limit);

    return query.getMany();
  }

  findOneInsumo(id: string, tenantId?: string) {
    return this.propio(this.insumosRepo, id, tenantId, 'Insumo no encontrado');
  }

  // Auditoría de seguridad (GoodsHabits, portabilidad Costos standalone): adaptado de
  // estia-costos-api/src/insumos/insumos.service.ts (InsumosService.calcularCostoUnitario).
  // Misma fórmula, un solo cambio de nombre: ahí el multiplicador de presentación es
  // cantidadPresentacion, aquí es factorConversion (ver comentario en insumo.entity.ts sobre
  // por qué cantidadPresentacion queda deprecado en vez de reusarse).
  private calcularCostoUnitario(precioCompra: number, factorConversion: number, merma: number): number {
    const factor = Number(factorConversion) > 0 ? Number(factorConversion) : 1;
    const denom = factor * (1 - Number(merma || 0) / 100);
    if (denom <= 0) return 0;
    return Number(precioCompra) / denom;
  }

  async createInsumo(data: Partial<Insumo>) {
    const tenantId = this.exigirTenant(data.tenantId);
    const payload: Partial<Insumo> = { ...data };
    delete (payload as any).id; // con id en el body save() pisaría el insumo de otro tenant
    await this.validarRefs(tenantId, { familiaId: payload.familiaId });
    // Se recalcula SIEMPRE aquí, nunca se confía en un costoUnitario que llegue del cliente
    // — pero solo cuando hay precioCompra que convertir. Sin precioCompra (insumo capturado
    // a mano, sin flujo de compra con presentación) se respeta el costoUnitario tal cual
    // llegue, por compatibilidad con los insumos que ya existen en producción hoy.
    if (payload.precioCompra !== undefined && payload.precioCompra !== null) {
      payload.costoUnitario = this.calcularCostoUnitario(
        Number(payload.precioCompra),
        payload.factorConversion !== undefined ? Number(payload.factorConversion) : 1,
        payload.merma !== undefined ? Number(payload.merma) : 0,
      );
    }
    const insumo = this.insumosRepo.create(payload);
    return this.insumosRepo.save(insumo);
  }

  // `manager` opcional (mismo patrón que resolveActiveInsumoChain): quien necesite que el update
  // viva dentro de SU transacción (PurchasesService.createPurchase) pasa el EntityManager
  // transaccional; sin él se usa el repositorio de siempre, comportamiento sin cambio.
  async updateInsumo(id: string, data: Partial<Insumo>, manager?: EntityManager, tenantId?: string) {
    const insumosRepo = manager ? manager.getRepository(Insumo) : this.insumosRepo;
    const existing = await insumosRepo.findOne({ where: this.dueno(id, tenantId) });
    if (tenantId && !existing) throw new NotFoundException('Insumo no encontrado');
    const payload: Partial<Insumo> = { ...data, updatedAt: new Date() };
    delete (payload as any).id;
    delete (payload as any).tenantId; // el negocio de un insumo no se cambia
    if (tenantId) await this.validarRefs(tenantId, { familiaId: payload.familiaId });
    // Mismo criterio que createInsumo(), pero mezclado con lo que ya había guardado — un
    // update que solo cambia factorConversion (sin volver a mandar precioCompra) debe
    // recalcular igual, usando el precioCompra ya existente en el registro.
    const precioCompra = payload.precioCompra !== undefined ? payload.precioCompra : existing?.precioCompra;
    if (precioCompra !== undefined && precioCompra !== null) {
      const factorConversion = payload.factorConversion !== undefined ? payload.factorConversion : existing?.factorConversion;
      const merma = payload.merma !== undefined ? payload.merma : existing?.merma;
      payload.costoUnitario = this.calcularCostoUnitario(
        Number(precioCompra),
        factorConversion !== undefined && factorConversion !== null ? Number(factorConversion) : 1,
        merma !== undefined && merma !== null ? Number(merma) : 0,
      );
    }
    await insumosRepo.update(id, payload);
    return insumosRepo.findOne({ where: { id } });
  }

  async deleteInsumo(id: string, tenantId?: string) {
    await this.propio(this.insumosRepo, id, tenantId, 'Insumo no encontrado');
    await this.insumosRepo.delete(id);
  }

  async replaceInsumo(oldId: string, newId: string, tenantId?: string) {
    if (oldId === newId) {
      throw new Error('El insumo de reemplazo no puede ser el mismo insumo');
    }

    const oldInsumo = await this.insumosRepo.findOne({ where: this.dueno(oldId, tenantId) });
    if (!oldInsumo) {
      throw new NotFoundException('Insumo a reemplazar no encontrado');
    }

    // El reemplazo debe ser del mismo tenant que el insumo original
    const newInsumo = await this.insumosRepo.findOne({ where: this.dueno(newId, oldInsumo.tenantId || undefined) });
    if (!newInsumo) {
      throw new NotFoundException('Insumo de reemplazo no encontrado');
    }

    if (!newInsumo.isActive) {
      throw new Error('El insumo de reemplazo debe estar activo');
    }

    const cycle = await this.wouldCreateReplacementCycle(oldId, newId);
    if (cycle) {
      throw new Error('Referencia circular: esta cadena de reemplazo ya depende del insumo original');
    }

    await this.insumosRepo.update(oldId, { isActive: false, reemplazadoPorId: newId, updatedAt: new Date() });
    return this.insumosRepo.findOne({ where: { id: oldId } });
  }

  private async wouldCreateReplacementCycle(
    oldId: string,
    candidateId: string,
    visitados: Set<string> = new Set(),
  ): Promise<boolean> {
    if (candidateId === oldId) return true;

    if (visitados.has(candidateId)) {
      throw new Error(`Referencia circular ya existente en la cadena de reemplazo del insumo ${candidateId}`);
    }
    visitados.add(candidateId);

    const candidate = await this.insumosRepo.findOne({ where: { id: candidateId } });
    if (candidate?.reemplazadoPorId) {
      if (await this.wouldCreateReplacementCycle(oldId, candidate.reemplazadoPorId, visitados)) {
        visitados.delete(candidateId);
        return true;
      }
    }

    visitados.delete(candidateId);
    return false;
  }

  async getNextInsumoCode(familiaId: string, tenantId?: string): Promise<{ codigo: string }> {
    const familia = await this.propio(this.familiasRepo, familiaId, tenantId, 'Familia no encontrada');

    const count = await this.insumosRepo.count({
      where: { familiaId },
    });
    const nextNumber = count + 1;
    const codigo = `${familia.prefijo}-${String(nextNumber).padStart(3, '0')}`;
    return { codigo };
  }

  async importInsumos(insumos: any[], tenantId?: string) {
    this.exigirTenant(tenantId);
    const results = { success: 0, errors: [] as any[] };
    const familias = await this.familiasRepo.find({ where: { tenantId } as any }); // solo las familias del tenant

    for (let i = 0; i < insumos.length; i++) {
      const row = insumos[i];
      const rowNumber = i + 2; // +2 because header is row 1

      try {
        // Validate familia exists
        const familia = familias.find(f => f.prefijo === row.familia);
        if (!familia) {
          results.errors.push({ row: rowNumber, message: `Familia "${row.familia}" no existe` });
          continue;
        }

        // Validate costoUnitario is a number
        const costoUnitario = parseFloat(row.costoUnitario);
        if (isNaN(costoUnitario)) {
          results.errors.push({ row: rowNumber, message: `costoUnitario debe ser un número válido` });
          continue;
        }

        // Generate code
        const count = await this.insumosRepo.count({ where: { familiaId: familia.id } });
        const nextNumber = count + 1;
        const codigo = `${familia.prefijo}-${String(nextNumber).padStart(3, '0')}`;

        // Create insumo
        const insumo = this.insumosRepo.create({
          tenantId, // antes los insumos importados quedaban sin negocio
          codigo,
          nombre: row.nombre,
          descripcion: row.descripcion || '',
          familiaId: familia.id,
          presentacion: row.presentacion || '',
          presentacionCompra: row.presentacionCompra || '',
          unidadMedida: row.unidadMedida || 'pieza',
          costoUnitario,
          moneda: 'MXN',
          stockMinimo: parseFloat(row.stockMinimo) || 0,
          stockActual: 0,
          isActive: true,
        });

        await this.insumosRepo.save(insumo);
        results.success++;
      } catch (error) {
        results.errors.push({ row: rowNumber, message: error.message });
      }
    }

    return results;
  }

  // Almacenes
  findAllAlmacenes(tenantId?: string, sucursalId?: string) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = { tenantId };
    if (sucursalId) where.sucursalId = sucursalId;

    return this.almacenesRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  findOneAlmacen(id: string, tenantId?: string) {
    return this.propio(this.almacenesRepo, id, tenantId, 'Almacén no encontrado');
  }

  async createAlmacen(data: Partial<Almacen>) {
    const tenantId = this.exigirTenant(data.tenantId);
    delete (data as any).id;
    await this.validarRefs(tenantId, { sucursalId: (data as any).sucursalId });
    const almacen = this.almacenesRepo.create(data);
    return this.almacenesRepo.save(almacen);
  }

  async updateAlmacen(id: string, data: Partial<Almacen>, tenantId?: string) {
    const actual = await this.propio(this.almacenesRepo, id, tenantId, 'Almacén no encontrado');
    delete (data as any).id;
    delete (data as any).tenantId;
    await this.validarRefs(actual.tenantId, { sucursalId: (data as any).sucursalId });
    await this.almacenesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.almacenesRepo.findOne({ where: { id } });
  }

  async deleteAlmacen(id: string, tenantId?: string) {
    await this.propio(this.almacenesRepo, id, tenantId, 'Almacén no encontrado');
    await this.almacenesRepo.delete(id);
  }

  // Familias de Insumos
  findAllFamilias(tenantId?: string) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = { tenantId };

    return this.familiasRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  findOneFamilia(id: string, tenantId?: string) {
    return this.propio(this.familiasRepo, id, tenantId, 'Familia no encontrada');
  }

  async createFamilia(data: Partial<FamiliaInsumo>) {
    this.exigirTenant(data.tenantId);
    delete (data as any).id;
    const familia = this.familiasRepo.create(data);
    return this.familiasRepo.save(familia);
  }

  async updateFamilia(id: string, data: Partial<FamiliaInsumo>, tenantId?: string) {
    await this.propio(this.familiasRepo, id, tenantId, 'Familia no encontrada');
    delete (data as any).id;
    delete (data as any).tenantId;
    await this.familiasRepo.update(id, { ...data, updatedAt: new Date() });
    return this.familiasRepo.findOne({ where: { id } });
  }

  async deleteFamilia(id: string, tenantId?: string) {
    await this.propio(this.familiasRepo, id, tenantId, 'Familia no encontrada');
    await this.familiasRepo.delete(id);
  }

  // Recetas
  findAllRecipes(tenantId?: string, tipo?: string) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = { tenantId };
    if (tipo) where.tipo = tipo;

    return this.recipesRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  findOneRecipe(id: string, tenantId?: string) {
    return this.propio(this.recipesRepo, id, tenantId, 'Receta no encontrada');
  }

  async createRecipe(data: Partial<Recipe>) {
    this.exigirTenant(data.tenantId);
    delete (data as any).id;
    const recipe = this.recipesRepo.create(data);
    return this.recipesRepo.save(recipe);
  }

  async updateRecipe(id: string, data: Partial<Recipe>, tenantId?: string) {
    await this.propio(this.recipesRepo, id, tenantId, 'Receta no encontrada');
    delete (data as any).id;
    delete (data as any).tenantId;
    await this.recipesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.recipesRepo.findOne({ where: { id } });
  }

  async deleteRecipe(id: string, tenantId?: string) {
    await this.propio(this.recipesRepo, id, tenantId, 'Receta no encontrada');
    await this.recipesRepo.delete(id);
  }

  async importRecipes(recetas: any[], tenantId?: string) {
    this.exigirTenant(tenantId);
    const results = { success: 0, errors: [] as any[] };
    const insumos = await this.insumosRepo.find({ where: { isActive: true, tenantId } as any }); // solo insumos del tenant

    // Group by recipe name
    const groupedRecipes: Record<string, any[]> = {};
    for (const row of recetas) {
      if (!groupedRecipes[row.nombreReceta]) {
        groupedRecipes[row.nombreReceta] = [];
      }
      groupedRecipes[row.nombreReceta].push(row);
    }

    for (const [recipeName, rows] of Object.entries(groupedRecipes)) {
      try {
        const items: any[] = [];
        let costoTotal = 0;

        for (const row of rows) {
          // Validate insumo exists
          const insumo = insumos.find(i => i.nombre === row.nombreInsumo);
          if (!insumo) {
            results.errors.push({ row: recetas.indexOf(row) + 2, message: `Insumo "${row.nombreInsumo}" no existe` });
            continue;
          }

          const cantidad = parseFloat(row.cantidad);
          if (isNaN(cantidad)) {
            results.errors.push({ row: recetas.indexOf(row) + 2, message: `cantidad debe ser un número válido` });
            continue;
          }

          const itemCosto = cantidad * insumo.costoUnitario;
          costoTotal += itemCosto;

          items.push({
            insumoId: insumo.id,
            cantidad,
            unidadMedida: row.unidadMedida || insumo.unidadMedida,
            costoUnitario: insumo.costoUnitario,
            costoTotal: itemCosto,
          });
        }

        if (items.length === 0) {
          continue;
        }

        const firstRow = rows[0];
        const porciones = parseFloat(firstRow.porciones) || 1;
        const costoPorPorcion = costoTotal / porciones;
        const margenDeseado = 0.3; // 30% default margin
        const precioVentaSugerido = costoPorPorcion / (1 - margenDeseado);

        const recipe = this.recipesRepo.create({
          tenantId, // antes las recetas importadas quedaban sin negocio
          nombre: recipeName,
          descripcion: '',
          tipo: 'PRODUCTO_VENTA',
          rendimiento: porciones,
          unidadRendimiento: 'porciones',
          items,
          costoTotal,
          precioVentaSugerido,
          margenDeseado,
          isActive: true,
        });

        await this.recipesRepo.save(recipe);
        results.success++;
      } catch (error) {
        results.errors.push({ row: recetas.indexOf(rows[0]) + 2, message: error.message });
      }
    }

    return results;
  }

  // RecipeItem (líneas de receta normalizadas)
  async findRecipeItems(recipeId: string, tenantId?: string) {
    await this.propio(this.recipesRepo, recipeId, tenantId, 'Receta no encontrada');
    return this.recipeItemsRepo.find({
      where: { recipeId },
      order: { createdAt: 'ASC' },
    });
  }

  async createRecipeItem(recipeId: string, data: Partial<RecipeItem>, tenantId?: string) {
    const receta = await this.propio(this.recipesRepo, recipeId, tenantId, 'Receta no encontrada');
    delete (data as any).id;
    data.tenantId = receta.tenantId; // el negocio sale de la receta, no del body
    if (data.insumoId) await this.propio(this.insumosRepo, data.insumoId, receta.tenantId, 'Insumo no encontrado');
    if (data.componentRecipeId) await this.propio(this.recipesRepo, data.componentRecipeId, receta.tenantId, 'Receta componente no encontrada');
    const hasInsumo = !!data.insumoId;
    const hasComponentRecipe = !!data.componentRecipeId;

    if (hasInsumo === hasComponentRecipe) {
      throw new Error('Debe especificar exactamente uno: insumoId o componentRecipeId, nunca ambos ni ninguno');
    }

    if (data.componentRecipeId) {
      const cycle = await this.wouldCreateCycle(recipeId, data.componentRecipeId);
      if (cycle) {
        throw new Error('Referencia circular: esta receta ya depende de sí misma a través de esta cadena');
      }
    }

    const item = this.recipeItemsRepo.create({ ...data, recipeId });
    return this.recipeItemsRepo.save(item);
  }

  async updateRecipeItem(id: string, data: Partial<RecipeItem>, tenantId?: string) {
    const existing = await this.propio(this.recipeItemsRepo, id, tenantId, 'Línea de receta no encontrada');
    for (const k of ['id', 'tenantId', 'recipeId'] as const) delete (data as any)[k];
    if (data.insumoId) await this.propio(this.insumosRepo, data.insumoId, existing.tenantId, 'Insumo no encontrado');
    if (data.componentRecipeId) await this.propio(this.recipesRepo, data.componentRecipeId, existing.tenantId, 'Receta componente no encontrada');

    const insumoId = data.insumoId !== undefined ? data.insumoId : existing.insumoId;
    const componentRecipeId = data.componentRecipeId !== undefined ? data.componentRecipeId : existing.componentRecipeId;
    const hasInsumo = !!insumoId;
    const hasComponentRecipe = !!componentRecipeId;

    if (hasInsumo === hasComponentRecipe) {
      throw new Error('Debe especificar exactamente uno: insumoId o componentRecipeId, nunca ambos ni ninguno');
    }

    if (hasComponentRecipe) {
      const cycle = await this.wouldCreateCycle(existing.recipeId, componentRecipeId);
      if (cycle) {
        throw new Error('Referencia circular: esta receta ya depende de sí misma a través de esta cadena');
      }
    }

    await this.recipeItemsRepo.update(id, { ...data, updatedAt: new Date() });
    return this.recipeItemsRepo.findOne({ where: { id } });
  }

  async deleteRecipeItem(id: string, tenantId?: string) {
    await this.propio(this.recipeItemsRepo, id, tenantId, 'Línea de receta no encontrada');
    await this.recipeItemsRepo.delete(id);
  }

  // Ronda de seguimiento (arquitectura): la caminata de reemplazadoPorId se unificó en
  // insumo-resolution.ts (compartida con sales.service.ts/products.service.ts) — este método
  // solo traduce el resultado al contrato de error que ya tenía (Error genérico, mismos
  // mensajes exactos), leyendo con this.insumosRepo.manager (no-transaccional, equivalente a
  // this.insumosRepo.findOne() de antes).
  private async costoUnitarioInsumo(insumo: Insumo, visitados: Set<string> = new Set()): Promise<number> {
    const resultado = await resolveActiveInsumoChain(this.insumosRepo.manager, insumo, visitados);
    if (resultado.ok) {
      return Number(resultado.insumo.costoUnitario);
    }
    if (resultado.reason === 'CYCLE') {
      throw new Error(`Referencia circular detectada en la cadena de reemplazo del insumo ${resultado.insumoId}`);
    }
    if (resultado.reason === 'NO_REPLACEMENT') {
      throw new Error(`El insumo "${resultado.nombre}" está inactivo y no tiene reemplazo configurado`);
    }
    throw new Error(`El insumo de reemplazo ${resultado.insumoId} no existe`);
  }

  async costoRecipe(recipeId: string, visitados: Set<string> = new Set()): Promise<{ subtotal: number; costoPorUnidad: number }> {
    if (visitados.has(recipeId)) {
      throw new Error(`Referencia circular detectada en la receta ${recipeId}`);
    }
    visitados.add(recipeId);

    const recipe = await this.recipesRepo.findOne({ where: { id: recipeId } });
    if (!recipe) {
      throw new Error('Receta no encontrada');
    }

    const items = await this.recipeItemsRepo.find({ where: { recipeId } });

    let subtotal = 0;
    for (const item of items) {
      if (item.insumoId) {
        const insumo = await this.insumosRepo.findOne({ where: { id: item.insumoId } });
        if (!insumo) {
          throw new Error(`Insumo ${item.insumoId} no encontrado`);
        }
        const costoUnitario = await this.costoUnitarioInsumo(insumo);
        subtotal += Number(item.cantidad) * costoUnitario;
      } else if (item.componentRecipeId) {
        const sub = await this.costoRecipe(item.componentRecipeId, visitados);
        subtotal += Number(item.cantidad) * sub.costoPorUnidad;
      }
    }

    const costoPorUnidad = Number(recipe.rendimiento) > 0 ? subtotal / Number(recipe.rendimiento) : 0;

    visitados.delete(recipeId);
    return { subtotal, costoPorUnidad };
  }

  async getRecipeCost(recipeId: string, tenantId?: string) {
    await this.propio(this.recipesRepo, recipeId, tenantId, 'Receta no encontrada');
    return this.costoRecipe(recipeId);
  }

  private async wouldCreateCycle(
    parentRecipeId: string,
    componentRecipeId: string,
    visitados: Set<string> = new Set(),
  ): Promise<boolean> {
    if (parentRecipeId === componentRecipeId) return true;

    if (visitados.has(componentRecipeId)) {
      throw new Error(`Referencia circular ya existente en la receta ${componentRecipeId}`);
    }
    visitados.add(componentRecipeId);

    const items = await this.recipeItemsRepo.find({ where: { recipeId: componentRecipeId } });
    for (const item of items) {
      if (item.componentRecipeId) {
        if (await this.wouldCreateCycle(parentRecipeId, item.componentRecipeId, visitados)) {
          visitados.delete(componentRecipeId);
          return true;
        }
      }
    }

    visitados.delete(componentRecipeId);
    return false;
  }

  // Inventario
  async findInventoryByPeriod(tenantId?: string, periodo?: string) {
    try {
      if (!tenantId) return [];
      const where: any = { tenantId };
      if (periodo) where.periodo = periodo;

      return this.inventoryRepo.find({
        where,
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      console.error('CostsService.findInventoryByPeriod error:', error);
      throw new Error(`Error al obtener inventario: ${error.message}`);
    }
  }

  async findInventoryByInsumo(insumoId: string, periodo: string, tenantId?: string) {
    if (!tenantId) return null; // el cálculo por insumo solo se resuelve dentro de un tenant
    return this.inventoryRepo.findOne({
      where: { insumoId, periodo, tenantId } as any,
    });
  }

  async createInventory(data: Partial<Inventory>) {
    const tenantId = this.exigirTenant(data.tenantId);
    delete (data as any).id;
    await this.validarRefs(tenantId, { insumoId: data.insumoId });
    const inventory = this.inventoryRepo.create(data);
    return this.inventoryRepo.save(inventory);
  }

  async updateInventory(id: string, data: Partial<Inventory>, tenantId?: string) {
    const actual = await this.propio(this.inventoryRepo, id, tenantId, 'Inventario no encontrado');
    delete (data as any).id;
    delete (data as any).tenantId;
    await this.validarRefs(actual.tenantId, { insumoId: data.insumoId });
    await this.inventoryRepo.update(id, { ...data, updatedAt: new Date() });
    return this.inventoryRepo.findOne({ where: { id } });
  }

  // Movimientos de inventario (ledger auditable, solo lectura desde aquí — se escriben
  // desde SalesService dentro de la transacción de la venta)
  findInventoryMovements(tenantId?: string, filters?: { insumoId?: string; desde?: string; hasta?: string }) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = { tenantId };
    if (filters?.insumoId) where.insumoId = filters.insumoId;
    if (filters?.desde && filters?.hasta) {
      where.fecha = Between(new Date(filters.desde), new Date(filters.hasta));
    }

    return this.inventoryMovementRepo.find({
      where,
      order: { fecha: 'DESC' },
    });
  }

  async deleteInventory(id: string, tenantId?: string) {
    await this.propio(this.inventoryRepo, id, tenantId, 'Inventario no encontrado');
    await this.inventoryRepo.delete(id);
  }

  // Costo de Venta
  async calculateCostOfSales(tenantId?: string, periodo?: string) {
    try {
      if (!tenantId) return { periodo, detalles: [], totalGeneral: 0 };
      const where: any = { tenantId };
      if (periodo) where.periodo = periodo;

      const inventories = await this.inventoryRepo.find({
        where,
        order: { createdAt: 'DESC' },
      });

      const results = inventories.map((inv) => {
        const costoVenta = Number(inv.inventarioInicial) + Number(inv.entradas) - Number(inv.inventarioFinal);
        return {
          insumoId: inv.insumoId,
          periodo: inv.periodo,
          inventarioInicial: inv.inventarioInicial,
          entradas: inv.entradas,
          salidas: inv.salidas,
          inventarioFinal: inv.inventarioFinal,
          costoPromedio: inv.costoPromedio,
          costoVenta,
        };
      });

      const totalGeneral = results.reduce((sum, r) => sum + r.costoVenta, 0);

      return {
        periodo,
        detalles: results,
        totalGeneral,
      };
    } catch (error) {
      throw new Error(`Error al calcular costo de venta: ${error.message}`);
    }
  }

  // Physical Count (Conteo Físico)
  async createPhysicalCount(data: {
    fecha: Date;
    insumoId: string;
    existenciaFisica: number;
    motivo?: string;
    tenantId?: string;
    branchId?: string;
  }) {
    // Get theoretical existence from insumo
    const tenantId = this.exigirTenant(data.tenantId);
    delete (data as any).id;
    await this.validarRefs(tenantId, { branchId: data.branchId });
    const insumo = await this.insumosRepo.findOne({ where: { id: data.insumoId, tenantId } as any });
    if (!insumo) {
      throw new NotFoundException('Insumo no encontrado');
    }

    const existenciaTeorica = Number(insumo.stockActual);
    const diferencia = Number(data.existenciaFisica) - existenciaTeorica;

    const physicalCount = this.physicalCountRepo.create({
      ...data,
      existenciaTeorica,
      diferencia,
    });

    const saved = await this.physicalCountRepo.save(physicalCount);

    // Update insumo stock to match physical count
    insumo.stockActual = data.existenciaFisica;
    await this.insumosRepo.save(insumo);

    return saved;
  }

  findPhysicalCounts(tenantId?: string, insumoId?: string) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = { tenantId };
    if (insumoId) where.insumoId = insumoId;

    return this.physicalCountRepo.find({
      where,
      order: { fecha: 'DESC' },
    });
  }

  findPhysicalCountsByPeriod(fechaInicio: Date, fechaFin: Date, tenantId?: string) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = {
      fecha: Between(fechaInicio, fechaFin),
      tenantId,
    };

    return this.physicalCountRepo.find({
      where,
      order: { fecha: 'DESC' },
    });
  }

  // Justificables
  // `manager` opcional (mismo patrón que updateInsumo/resolveActiveInsumoChain): SalesService
  // registra aquí las mermas de una cuenta cancelada DENTRO de la transacción de la cancelación.
  async createJustifiable(data: {
    periodo: string;
    categoria: JustifiableCategory;
    descripcion?: string;
    monto: number;
    detalles?: any;
    tenantId?: string;
    branchId?: string;
  }, manager?: EntityManager) {
    this.exigirTenant(data.tenantId);
    delete (data as any).id;
    const justifiableRepo = manager ? manager.getRepository(Justifiable) : this.justifiableRepo;
    const justifiable = justifiableRepo.create(data);
    return justifiableRepo.save(justifiable);
  }

  findJustificablesByPeriod(periodo: string, tenantId?: string) {
    if (!tenantId) return Promise.resolve([]);
    const where: any = { periodo, tenantId };

    return this.justifiableRepo.find({
      where,
      order: { categoria: 'ASC' },
    });
  }

  async calculateTotalJustificables(periodo: string, tenantId?: string) {
    const justificables = await this.findJustificablesByPeriod(periodo, tenantId);
    
    const totals = {
      ENERGETICOS: 0,
      INSUMOS_SERVICIO: 0,
      CORTESIAS_DESCUENTOS: 0,
      MERMAS_FALTANTES: 0,
      TOTAL: 0,
    };

    justificables.forEach((j) => {
      totals[j.categoria] += Number(j.monto);
      totals.TOTAL += Number(j.monto);
    });

    return totals;
  }
}
