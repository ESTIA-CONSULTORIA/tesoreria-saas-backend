import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';

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

  // Auditoría de producto (GoodsHabits, Punto 2): mismo algoritmo que
  // sales.service.ts::resolveActiveInsumo() / costs.service.ts::costoUnitarioInsumo() —
  // sigue reemplazadoPorId hasta un insumo activo. Se duplica en vez de importar desde
  // otro módulo por el mismo motivo ya establecido en este código (delivery-ingest.service.ts):
  // evitar acoplamiento cruzado entre módulos solo para una función de ~15 líneas. A
  // diferencia de la de ventas, esta NO lanza — el stock del POS se calcula para una
  // lista completa de productos; un insumo con la cadena rota no debe tumbar el listado
  // entero, solo ese producto puntual queda con stock 0 y un warning en el log.
  private async resolveActiveInsumoSafe(insumo: Insumo, visitados: Set<string> = new Set()): Promise<Insumo | null> {
    if (visitados.has(insumo.id)) {
      this.logger.warn(`Referencia circular en la cadena de reemplazo del insumo ${insumo.id}`);
      return null;
    }
    visitados.add(insumo.id);

    if (insumo.isActive) return insumo;
    if (!insumo.reemplazadoPorId) {
      this.logger.warn(`Insumo "${insumo.nombre}" (${insumo.id}) está inactivo sin reemplazo configurado`);
      return null;
    }
    const siguiente = await this.insumosRepo.findOne({ where: { id: insumo.reemplazadoPorId } });
    if (!siguiente) {
      this.logger.warn(`El insumo de reemplazo de "${insumo.nombre}" (${insumo.reemplazadoPorId}) no existe`);
      return null;
    }
    return this.resolveActiveInsumoSafe(siguiente, visitados);
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
