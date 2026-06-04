import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepo: Repository<Product>,
    @InjectRepository(Insumo)
    private insumosRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private recipesRepo: Repository<Recipe>,
  ) {}

  async findAll(branchId?: string, tenantId?: string) {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (tenantId) where.tenantId = tenantId;
    
    const products = await this.productsRepo.find({
      where,
      order: { name: 'ASC' },
    });

    // Add stock information to each product
    for (const product of products) {
      if (product.type === 'SIMPLE' && product.insumoId) {
        const insumo = await this.insumosRepo.findOne({ where: { id: product.insumoId } });
        (product as any).stock = insumo ? Number(insumo.stockActual) : 0;
        (product as any).stockMinimo = insumo ? Number(insumo.stockMinimo) : 0;
      } else if (product.type === 'PREPARADO' && product.recipeId) {
        // For prepared products, find the ingredient with minimum stock
        const recipe = await this.recipesRepo.findOne({ where: { id: product.recipeId } });
        if (recipe && recipe.items) {
          let minStock = Infinity;
          for (const item of recipe.items) {
            const insumo = await this.insumosRepo.findOne({ where: { id: item.insumoId } });
            if (insumo) {
              const availableStock = Number(insumo.stockActual) / item.cantidad;
              if (availableStock < minStock) {
                minStock = availableStock;
              }
            }
          }
          (product as any).stock = minStock === Infinity ? 0 : Math.floor(minStock);
          (product as any).stockMinimo = 0; // Prepared products don't have minimum stock
        } else {
          (product as any).stock = 0;
          (product as any).stockMinimo = 0;
        }
      } else {
        (product as any).stock = null; // No inventory tracking
        (product as any).stockMinimo = 0;
      }
    }

    return products;
  }

  findOne(id: string) {
    return this.productsRepo.findOne({ where: { id } });
  }

  create(data: Partial<Product>) {
    const product = this.productsRepo.create(data);
    return this.productsRepo.save(product);
  }

  async update(id: string, data: Partial<Product>) {
    await this.productsRepo.update(id, { ...data, updatedAt: new Date() });
    return this.productsRepo.findOne({ where: { id } });
  }

  async delete(id: string) {
    await this.productsRepo.delete(id);
  }
}
