import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';
import { Inventory } from './entities/inventory.entity';

@Injectable()
export class CostsService {
  constructor(
    @InjectRepository(Insumo)
    private insumosRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private recipesRepo: Repository<Recipe>,
    @InjectRepository(Inventory)
    private inventoryRepo: Repository<Inventory>,
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
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (periodo) where.periodo = periodo;

    return this.inventoryRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
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
  }
}
