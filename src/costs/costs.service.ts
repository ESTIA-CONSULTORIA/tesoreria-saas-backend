import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { RecipeItem } from './entities/recipe-item.entity';
import { Inventory } from './entities/inventory.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Justifiable, JustifiableCategory } from './entities/justifiable.entity';
import { Almacen } from './entities/almacen.entity';
import { FamiliaInsumo } from './entities/familia-insumo.entity';

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
    @InjectRepository(PhysicalCount)
    private physicalCountRepo: Repository<PhysicalCount>,
    @InjectRepository(Justifiable)
    private justifiableRepo: Repository<Justifiable>,
    @InjectRepository(Almacen)
    private almacenesRepo: Repository<Almacen>,
    @InjectRepository(FamiliaInsumo)
    private familiasRepo: Repository<FamiliaInsumo>,
  ) {}

  // Insumos
  findAllInsumos(tenantId?: string, categoriaId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (categoriaId) where.categoriaId = categoriaId;

    return this.insumosRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  async searchInsumos(search: string, limit: number = 10) {
    if (!search || search.length < 2) {
      return [];
    }

    const query = this.insumosRepo.createQueryBuilder('insumo');
    
    query.where(
      '(LOWER(insumo.codigo) LIKE LOWER(:search) OR LOWER(insumo.nombre) LIKE LOWER(:search) OR LOWER(insumo.descripcion) LIKE LOWER(:search))',
      { search: `%${search}%` }
    );

    query.andWhere('insumo.isActive = :isActive', { isActive: true });

    query.orderBy('insumo.nombre', 'ASC');
    query.limit(limit);

    return query.getMany();
  }

  findOneInsumo(id: string) {
    return this.insumosRepo.findOne({ where: { id } });
  }

  createInsumo(data: Partial<Insumo>) {
    const insumo = this.insumosRepo.create(data);
    return this.insumosRepo.save(insumo);
  }

  async updateInsumo(id: string, data: Partial<Insumo>) {
    await this.insumosRepo.update(id, { ...data, updatedAt: new Date() });
    return this.insumosRepo.findOne({ where: { id } });
  }

  async deleteInsumo(id: string) {
    await this.insumosRepo.delete(id);
  }

  async replaceInsumo(oldId: string, newId: string) {
    if (oldId === newId) {
      throw new Error('El insumo de reemplazo no puede ser el mismo insumo');
    }

    const oldInsumo = await this.insumosRepo.findOne({ where: { id: oldId } });
    if (!oldInsumo) {
      throw new Error('Insumo a reemplazar no encontrado');
    }

    const newInsumo = await this.insumosRepo.findOne({ where: { id: newId } });
    if (!newInsumo) {
      throw new Error('Insumo de reemplazo no encontrado');
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

  async getNextInsumoCode(familiaId: string): Promise<{ codigo: string }> {
    const familia = await this.familiasRepo.findOne({ where: { id: familiaId } });
    if (!familia) {
      throw new Error('Familia no encontrada');
    }

    const count = await this.insumosRepo.count({
      where: { familiaId },
    });
    const nextNumber = count + 1;
    const codigo = `${familia.prefijo}-${String(nextNumber).padStart(3, '0')}`;
    return { codigo };
  }

  async importInsumos(insumos: any[]) {
    const results = { success: 0, errors: [] as any[] };
    const familias = await this.familiasRepo.find();

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
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (sucursalId) where.sucursalId = sucursalId;

    return this.almacenesRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  findOneAlmacen(id: string) {
    return this.almacenesRepo.findOne({ where: { id } });
  }

  createAlmacen(data: Partial<Almacen>) {
    const almacen = this.almacenesRepo.create(data);
    return this.almacenesRepo.save(almacen);
  }

  async updateAlmacen(id: string, data: Partial<Almacen>) {
    await this.almacenesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.almacenesRepo.findOne({ where: { id } });
  }

  async deleteAlmacen(id: string) {
    await this.almacenesRepo.delete(id);
  }

  // Familias de Insumos
  findAllFamilias(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    return this.familiasRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  findOneFamilia(id: string) {
    return this.familiasRepo.findOne({ where: { id } });
  }

  createFamilia(data: Partial<FamiliaInsumo>) {
    const familia = this.familiasRepo.create(data);
    return this.familiasRepo.save(familia);
  }

  async updateFamilia(id: string, data: Partial<FamiliaInsumo>) {
    await this.familiasRepo.update(id, { ...data, updatedAt: new Date() });
    return this.familiasRepo.findOne({ where: { id } });
  }

  async deleteFamilia(id: string) {
    await this.familiasRepo.delete(id);
  }

  // Recetas
  findAllRecipes(tenantId?: string, tipo?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (tipo) where.tipo = tipo;

    return this.recipesRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  findOneRecipe(id: string) {
    return this.recipesRepo.findOne({ where: { id } });
  }

  createRecipe(data: Partial<Recipe>) {
    const recipe = this.recipesRepo.create(data);
    return this.recipesRepo.save(recipe);
  }

  async updateRecipe(id: string, data: Partial<Recipe>) {
    await this.recipesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.recipesRepo.findOne({ where: { id } });
  }

  async deleteRecipe(id: string) {
    await this.recipesRepo.delete(id);
  }

  async importRecipes(recetas: any[]) {
    const results = { success: 0, errors: [] as any[] };
    const insumos = await this.insumosRepo.find({ where: { isActive: true } });

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
  findRecipeItems(recipeId: string) {
    return this.recipeItemsRepo.find({
      where: { recipeId },
      order: { createdAt: 'ASC' },
    });
  }

  async createRecipeItem(recipeId: string, data: Partial<RecipeItem>) {
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

  async updateRecipeItem(id: string, data: Partial<RecipeItem>) {
    const existing = await this.recipeItemsRepo.findOne({ where: { id } });
    if (!existing) {
      throw new Error('Línea de receta no encontrada');
    }

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

  async deleteRecipeItem(id: string) {
    await this.recipeItemsRepo.delete(id);
  }

  private async costoUnitarioInsumo(insumo: Insumo, visitados: Set<string> = new Set()): Promise<number> {
    if (visitados.has(insumo.id)) {
      throw new Error(`Referencia circular detectada en la cadena de reemplazo del insumo ${insumo.id}`);
    }
    visitados.add(insumo.id);

    if (insumo.isActive) {
      visitados.delete(insumo.id);
      return Number(insumo.costoUnitario);
    }

    if (!insumo.reemplazadoPorId) {
      throw new Error(`El insumo "${insumo.nombre}" está inactivo y no tiene reemplazo configurado`);
    }

    const siguiente = await this.insumosRepo.findOne({ where: { id: insumo.reemplazadoPorId } });
    if (!siguiente) {
      throw new Error(`El insumo de reemplazo ${insumo.reemplazadoPorId} no existe`);
    }

    const costo = await this.costoUnitarioInsumo(siguiente, visitados);
    visitados.delete(insumo.id);
    return costo;
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

  async getRecipeCost(recipeId: string) {
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
      const where: any = {};
      if (tenantId) where.tenantId = tenantId;
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

  async findInventoryByInsumo(insumoId: string, periodo: string) {
    return this.inventoryRepo.findOne({
      where: { insumoId, periodo },
    });
  }

  async createInventory(data: Partial<Inventory>) {
    const inventory = this.inventoryRepo.create(data);
    return this.inventoryRepo.save(inventory);
  }

  async updateInventory(id: string, data: Partial<Inventory>) {
    await this.inventoryRepo.update(id, { ...data, updatedAt: new Date() });
    return this.inventoryRepo.findOne({ where: { id } });
  }

  async deleteInventory(id: string) {
    await this.inventoryRepo.delete(id);
  }

  // Costo de Venta
  async calculateCostOfSales(tenantId?: string, periodo?: string) {
    try {
      const where: any = {};
      if (tenantId) where.tenantId = tenantId;
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
    const insumo = await this.insumosRepo.findOne({ where: { id: data.insumoId } });
    if (!insumo) {
      throw new Error('Insumo no encontrado');
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
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (insumoId) where.insumoId = insumoId;

    return this.physicalCountRepo.find({
      where,
      order: { fecha: 'DESC' },
    });
  }

  findPhysicalCountsByPeriod(fechaInicio: Date, fechaFin: Date, tenantId?: string) {
    const where: any = {
      fecha: Between(fechaInicio, fechaFin),
    };
    if (tenantId) where.tenantId = tenantId;

    return this.physicalCountRepo.find({
      where,
      order: { fecha: 'DESC' },
    });
  }

  // Justificables
  async createJustifiable(data: {
    periodo: string;
    categoria: JustifiableCategory;
    descripcion?: string;
    monto: number;
    detalles?: any;
    tenantId?: string;
    branchId?: string;
  }) {
    const justifiable = this.justifiableRepo.create(data);
    return this.justifiableRepo.save(justifiable);
  }

  findJustificablesByPeriod(periodo: string, tenantId?: string) {
    const where: any = { periodo };
    if (tenantId) where.tenantId = tenantId;

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
