import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { resolveActiveInsumoChain } from '../costs/insumo-resolution';
import { isValidTasaIva, TASAS_IVA } from '../config/iva.config';
import { PlanMembresia } from '../membresias/entities/plan-membresia.entity';

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
    // Gimnasio: para no mostrar en el catálogo los productos que son planes de membresía. Opcional: sin el módulo, no oculta nada.
    @Optional() @InjectRepository(PlanMembresia)
    private planesRepo?: Repository<PlanMembresia>,
  ) {}

  // Ids de los productos que representan un plan de membresía (se cobran desde Membresías, con socio). Si la consulta falla
  // (la tabla aún no existe en una base sin migrar) el catálogo NO se rompe: simplemente no oculta nada.
  private async idsProductosDePlanes(tenantId?: string): Promise<Set<string>> {
    if (!tenantId || !this.planesRepo) return new Set();
    try {
      const planes = await this.planesRepo.find({ where: { tenantId }, select: ['productId'] as any });
      return new Set(planes.map((p) => p.productId).filter((x): x is string => !!x));
    } catch (error) {
      this.logger.warn(`No se pudo consultar los planes de membresía para ocultar sus productos: ${(error as Error).message}`);
      return new Set();
    }
  }

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

    const todos = await this.productsRepo.find({
      where,
      order: { name: 'ASC' },
    });
    const deMembresia = await this.idsProductosDePlanes(tenantId);
    const products = deMembresia.size > 0 ? todos.filter((p) => !deMembresia.has(p.id)) : todos;

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

  // tasaIva del producto: '16' | '8' | '0' | 'EXENTO'; null o '' = usa la tasa del negocio. Cualquier otro valor es 400. Si el
  // body no trae el campo no se toca (así editar el nombre no depende de que la columna exista).
  private tasaIvaSaneada(data: Partial<Product>): { tasaIva?: string | null } {
    const v = (data as any)?.tasaIva;
    if (v === undefined) return {};
    if (v === null || v === '') return { tasaIva: null };
    if (!isValidTasaIva(v)) {
      throw new BadRequestException(`tasaIva inválida: usa ${TASAS_IVA.join(', ')} o déjala vacía para usar la del negocio.`);
    }
    return { tasaIva: v };
  }

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): findOne()/update()/delete()
  // no verificaban que el producto perteneciera al tenant de quien llama — Product sí tiene
  // tenantId propio, mismo patrón que banks.service.ts. Opcional para no romper a SOPORTE.
  findOne(id: string, tenantId?: string) {
    return this.productsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
  }

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): create() tomaba el tenantId
  // del body tal cual — sin él, el producto quedaba con tenantId null (huérfano: invisible
  // para todo tenant y imposible de editar/borrar por la API). Ahora el tenantId SIEMPRE
  // viene resuelto por el controller (req.user.tenantId, con body.tenantId solo como
  // fallback para SOPORTE) y aquí se impone sobre lo que traiga el body; sin tenant en
  // ninguno de los dos lados, se rechaza.
  create(data: Partial<Product>, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('No se puede crear un producto sin tenant.');
    }
    const product = this.productsRepo.create({ ...data, tenantId, ...this.tasaIvaSaneada(data) });
    return this.productsRepo.save(product);
  }

  // tenantId e id se descartan del body: antes `{ ...data }` iba directo a repo.update(), así
  // que un ADMIN podía reasignar su producto a OTRO tenant (o dejarlo huérfano con
  // tenantId: null) mandando ese campo en el PUT. La pertenencia se sigue verificando contra
  // el tenant del JWT; SOPORTE (sin tenantId) conserva acceso total, pero el producto debe
  // existir.
  async update(id: string, data: Partial<Product>, tenantId?: string) {
    const existing = await this.productsRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
    if (!existing) throw new NotFoundException('Producto no encontrado');
    const { tenantId: _ignoredTenantId, id: _ignoredId, ...safeData } = data as any;
    await this.productsRepo.update(id, { ...safeData, ...this.tasaIvaSaneada(data), updatedAt: new Date() });
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
