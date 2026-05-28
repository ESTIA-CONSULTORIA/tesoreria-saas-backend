import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { Recipe } from './entities/recipe.entity';

@Injectable()
export class CostsService {
  constructor(
    @InjectRepository(Insumo)
    private insumosRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private recipesRepo: Repository<Recipe>,
  ) {}

  // Insumos
  findAllInsumos(tenantId?: string) {
    return this.insumosRepo.find({
      where: tenantId ? { tenantId } : undefined,
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
  findAllRecipes(tenantId?: string) {
    return this.recipesRepo.find({
      where: tenantId ? { tenantId } : undefined,
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
}
