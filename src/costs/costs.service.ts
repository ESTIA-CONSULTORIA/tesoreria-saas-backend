import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { Inventory } from './entities/inventory.entity';
import { PhysicalCount } from './entities/physical-count.entity';
import { Justifiable, JustifiableCategory } from './entities/justifiable.entity';

@Injectable()
export class CostsService {
  constructor(
    @InjectRepository(Insumo)
    private insumosRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private recipesRepo: Repository<Recipe>,
    @InjectRepository(Inventory)
    private inventoryRepo: Repository<Inventory>,
    @InjectRepository(PhysicalCount)
    private physicalCountRepo: Repository<PhysicalCount>,
    @InjectRepository(Justifiable)
    private justifiableRepo: Repository<Justifiable>,
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
