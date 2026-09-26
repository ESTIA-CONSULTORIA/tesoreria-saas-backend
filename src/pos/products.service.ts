import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { resolveActiveInsumoChain } from '../costs/insumo-resolution';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private productsRepo: Repository<Product>,
    @InjectRepository(Insumo)
    private insumosRepo: Repository<Insumo>,
    @InjectRepository(Recipe)
    private recipesRepo: Repository<Recipe>,
  ) {}

  // Ronda de seguimiento (arquitectura): la caminata de reemplazadoPorId se unificó en
  // insumo-resolution.ts (compartida con sales.service.ts/costs.service.ts) — este método
  // solo traduce el resultado al contrato que ya tenía: nunca lanza, loggea con
  // logger.warn() y devuelve null (el stock del POS se calcula para una lista completa de
  // productos; un insumo con la cadena rota no debe tumbar el listado entero, solo ese
  // producto puntual queda con stock 0), leyendo con this.insumosRepo.manager
  // (no-transaccional, equivalente a this.insumosRepo.findOne() de antes).
  private async resolveActiveInsumoSafe(insumo: Insumo, visitados: Set<string> = new Set()): Promise<Insumo | null> {
    const resultado = await resolveActiveInsumoChain(this.insumosRepo.manager, insumo, visitados);
    if (resultado.ok) {
      return resultado.insumo;
    }
    if (resultado.reason === 'CYCLE') {
      this.logger.warn(`Referencia circular en la cadena de reemplazo del insumo ${resultado.insumoId}`);
    } else if (resultado.reason === 'NO_REPLACEMENT') {
      this.logger.warn(`Insumo "${resultado.nombre}" (${resultado.insumoId}) está inactivo sin reemplazo configurado`);
    } else {
      this.logger.warn(`El insumo de reemplazo de "${resultado.nombre}" (${resultado.insumoId}) no existe`);
    }
    return null;
  }

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
        const crudo = await this.insumosRepo.findOne({ where: { id: product.insumoId } });
        const insumo = crudo ? await this.resolveActiveInsumoSafe(crudo) : null;
        (product as any).stock = insumo ? Number(insumo.stockActual) : 0;
        (product as any).stockMinimo = insumo ? Number(insumo.stockMinimo) : 0;
      } else if (product.type === 'PREPARADO' && product.recipeId) {
        // For prepared products, find the ingredient with minimum stock
        const recipe = await this.recipesRepo.findOne({ where: { id: product.recipeId } });
        if (recipe && recipe.items) {
          let minStock = Infinity;
          for (const item of recipe.items) {
            const crudo = await this.insumosRepo.findOne({ where: { id: item.insumoId } });
            const insumo = crudo ? await this.resolveActiveInsumoSafe(crudo) : null;
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

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): findOne()/update()/delete()
  // no verificaban que el producto perteneciera al tenant de quien llama — Product sí tiene
  // tenantId propio, mismo patrón que banks.service.ts. Opcional para no romper a SOPORTE.
  findOne(id: string, tenantId?: string) {
    return this.productsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
  }

  create(data: Partial<Product>) {
    const product = this.productsRepo.create(data);
    return this.productsRepo.save(product);
  }

  async update(id: string, data: Partial<Product>, tenantId?: string) {
    if (tenantId) {
      const existing = await this.productsRepo.findOne({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Producto no encontrado');
    }
    await this.productsRepo.update(id, { ...data, updatedAt: new Date() });
    return this.productsRepo.findOne({ where: { id } });
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      const existing = await this.productsRepo.findOne({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Producto no encontrado');
    }
    await this.productsRepo.delete(id);
    return { deleted: true };
  }
}
