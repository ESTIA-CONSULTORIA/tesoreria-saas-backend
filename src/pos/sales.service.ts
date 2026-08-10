import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Sale, SaleItem } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { InventoryMovement } from '../costs/entities/inventory-movement.entity';
import { Branch } from '../branches/entities/branch.entity';
import { InsumoAlertsService } from './insumo-alerts.service';

interface LowStockInsumo {
  id: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private salesRepo: Repository<Sale>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Recipe)
    private recipeRepo: Repository<Recipe>,
    @InjectRepository(Insumo)
    private insumoRepo: Repository<Insumo>,
    private dataSource: DataSource,
    private insumoAlertsService: InsumoAlertsService,
  ) {}

  async generateFolio(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.salesRepo
      .createQueryBuilder('sale')
      .where('sale.folio LIKE :prefix', { prefix: `VTA-${today}%` })
      .getCount();
    const nextNumber = (count + 1).toString().padStart(3, '0');
    return `VTA-${today}-${nextNumber}`;
  }

  private async calculateCostoReal(items: SaleItem[]): Promise<number> {
    let total = 0;
    for (const item of items) {
      const product = await this.productRepo.findOne({ where: { id: item.productoId } });
      if (!product) continue;
      if (product.type === 'PREPARADO' && product.recipeId) {
        const recipe = await this.recipeRepo.findOne({ where: { id: product.recipeId } });
        if (recipe?.items) {
          for (const ri of recipe.items) {
            const insumo = await this.insumoRepo.findOne({ where: { id: ri.insumoId } });
            if (insumo) total += Number(insumo.costoUnitario) * ri.cantidad * item.cantidad;
          }
        }
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        const insumo = await this.insumoRepo.findOne({ where: { id: product.insumoId } });
        if (insumo) total += Number(insumo.costoUnitario) * item.cantidad;
      }
    }
    return Math.round(total * 100) / 100;
  }

  async create(data: {
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    impuestos: number;
    total: number;
    formaPago?: string;
    formasPago?: any[];
    cajero: string;
    turnoId: string;
    sucursalId: string;
    tenantId: string;
    notas?: string;
    referencia?: string;
    tableId?: string;
  }) {
    const folio = await this.generateFolio();
    const now = new Date();
    const costoReal = await this.calculateCostoReal(data.items);

    let savedSale: Sale;
    let lowStockInsumos: LowStockInsumo[] = [];

    try {
      // Venta + descuento de inventario en una sola transacción: si cualquier parte
      // falla, TypeORM hace rollback de todo (ni la venta ni el inventario quedan a
      // medias) y relanza el error, que se captura abajo.
      savedSale = await this.dataSource.transaction(async (manager) => {
        const sale = manager.create(Sale, {
          folio,
          fecha: now,
          hora: now.toTimeString().slice(0, 8),
          items: data.items,
          subtotal: data.subtotal,
          descuento: data.descuento,
          impuestos: data.impuestos,
          total: data.total,
          formaPago: (data.formaPago || data.formasPago?.[0]?.forma) as any,
          formasPago: data.formasPago || [],
          // Mark as PAGADA immediately when payment forms are included
          status: (data.formasPago && data.formasPago.length > 0) ? 'PAGADA' : 'ABIERTA',
          cajero: data.cajero,
          turnoId: data.turnoId,
          sucursalId: data.sucursalId,
          tenantId: data.tenantId,
          notas: data.notas || '',
          referencia: data.referencia || '',
          tableId: data.tableId || null,
          costoReal,
        });

        const saved = await manager.save(sale);

        // Deduct inventory for each product sold; junta los insumos que quedaron en
        // stock bajo para generar sus alertas DESPUÉS de confirmar la venta (abajo).
        lowStockInsumos = await this.deductInventory(manager, data.items, folio, data.tenantId, data.sucursalId);

        return saved;
      });
    } catch (error) {
      // Detalle técnico completo al log (para soporte/diagnóstico), mensaje genérico
      // y accionable al cajero: la causa más probable es momentánea (red, timeout) y
      // un reintento inmediato del mismo cobro debería funcionar.
      console.error(`SalesService.create error (folio ${folio}, rollback aplicado, nada quedó guardado):`, error);
      throw new Error('No se pudo procesar la venta, intenta de nuevo.');
    }

    // Alertas de stock bajo: best-effort, fuera de la transacción de la venta. La venta
    // ya está confirmada y cobrada; un fallo aquí no debe afectarla en absoluto.
    if (lowStockInsumos.length > 0) {
      await this.reportLowStockAlerts(lowStockInsumos, data, folio);
    }

    return savedSale;
  }

  private async reportLowStockAlerts(
    insumos: LowStockInsumo[],
    data: { sucursalId: string; tenantId: string; cajero: string },
    folio: string,
  ) {
    let companyId: string | undefined;
    try {
      // Insumo/Product/Sale no tienen companyId propio — se resuelve vía la sucursal,
      // que sí lo tiene (Branch.companyId), sin necesitar ningún cambio de esquema.
      const branch = await this.dataSource.getRepository(Branch).findOne({ where: { id: data.sucursalId } });
      companyId = branch?.companyId;
    } catch (error) {
      console.error(`SalesService: error al resolver companyId desde sucursalId ${data.sucursalId} para alertas de stock (folio ${folio}):`, error);
    }

    if (!companyId) {
      console.error(`SalesService: companyId no encontrado para sucursalId ${data.sucursalId}, se omiten alertas de stock bajo (folio ${folio})`);
      return;
    }

    for (const insumo of insumos) {
      try {
        const estado = insumo.stockActual <= 0 ? 'agotado' : 'proximo';
        await this.insumoAlertsService.upsert(data.tenantId, companyId, data.cajero, {
          insumoId: insumo.id,
          nombre: insumo.nombre,
          tipo: 'insumo',
          estado,
          notas: `Auto-generada por venta ${folio}: stock actual ${insumo.stockActual} (mínimo ${insumo.stockMinimo}).`,
        });
      } catch (error) {
        console.error(`SalesService: no se pudo crear/actualizar alerta de stock bajo para insumo ${insumo.nombre} (${insumo.id}), venta ${folio}:`, error);
      }
    }
  }

  private async deductInventory(manager: EntityManager, items: SaleItem[], folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo[]> {
    const lowStock: LowStockInsumo[] = [];
    for (const item of items) {
      const product = await manager.findOne(Product, { where: { id: item.productoId } });
      if (!product) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        // Deduct recipe ingredients
        lowStock.push(...await this.deductRecipeIngredients(manager, product.recipeId, item.cantidad, folio, tenantId, sucursalId));
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        // Deduct single insumo
        const result = await this.deductInsumo(manager, product.insumoId, item.cantidad, folio, tenantId, sucursalId);
        if (result) lowStock.push(result);
      }
    }
    return lowStock;
  }

  private async deductRecipeIngredients(manager: EntityManager, recipeId: string, quantity: number, folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo[]> {
    const recipe = await manager.findOne(Recipe, { where: { id: recipeId } });
    const lowStock: LowStockInsumo[] = [];
    if (!recipe || !recipe.items) return lowStock;

    for (const item of recipe.items) {
      const result = await this.deductInsumo(manager, item.insumoId, item.cantidad * quantity, folio, tenantId, sucursalId);
      if (result) lowStock.push(result);
    }
    return lowStock;
  }

  private async deductInsumo(manager: EntityManager, insumoId: string, quantity: number, folio: string, tenantId: string, sucursalId: string): Promise<LowStockInsumo | null> {
    const insumo = await manager.findOne(Insumo, { where: { id: insumoId } });
    if (!insumo) return null;

    const newStock = Math.max(0, Number(insumo.stockActual) - quantity);
    await manager.update(Insumo, insumoId, { stockActual: newStock });

    // Ledger auditable del movimiento — misma transacción que el descuento de stock,
    // a diferencia de las alertas de stock bajo (esas sí son best-effort y van aparte).
    const movement = manager.create(InventoryMovement, {
      insumoId: insumo.id,
      tenantId,
      tipo: 'SALIDA_VENTA',
      cantidad: quantity,
      stockResultante: newStock,
      costoUnitario: Number(insumo.costoUnitario),
      referencia: folio,
      sucursalId,
    });
    await manager.save(movement);

    const stockMinimo = Number(insumo.stockMinimo);
    if (newStock <= stockMinimo) {
      return { id: insumo.id, nombre: insumo.nombre, stockActual: newStock, stockMinimo };
    }
    return null;
  }

  async findAll(filters?: {
    status?: string;
    cajero?: string;
    turnoId?: string;
    sucursalId?: string;
    tenantId?: string;
    fechaInicio?: Date;
    fechaFin?: Date;
  }) {
    try {
      const query = this.salesRepo.createQueryBuilder('sale');

      if (filters?.status) {
        query.andWhere('sale.status = :status', { status: filters.status });
      }
      if (filters?.cajero) {
        query.andWhere('sale.cajero = :cajero', { cajero: filters.cajero });
      }
      if (filters?.turnoId) {
        query.andWhere('sale.turnoId = :turnoId', { turnoId: filters.turnoId });
      }
      if (filters?.sucursalId) {
        query.andWhere('sale.sucursalId = :sucursalId', { sucursalId: filters.sucursalId });
      }
      if (filters?.tenantId) {
        query.andWhere('sale.tenantId = :tenantId', { tenantId: filters.tenantId });
      }
      if (filters?.fechaInicio) {
        query.andWhere('sale.fecha >= :fechaInicio', { fechaInicio: filters.fechaInicio });
      }
      if (filters?.fechaFin) {
        query.andWhere('sale.fecha <= :fechaFin', { fechaFin: filters.fechaFin });
      }

      return query.orderBy('sale.createdAt', 'DESC').getMany();
    } catch (error) {
      console.error('SalesService.findAll error:', error);
      throw new Error(`Error al obtener ventas: ${error.message}`);
    }
  }

  async findOne(id: string) {
    try {
      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.findOne error:', error);
      throw new Error(`Error al obtener venta: ${error.message}`);
    }
  }

  async pay(id: string, data: {
    formaPago: string;
    montoRecibido: number;
    cambio: number;
  }) {
    try {
      const sale = await this.salesRepo.findOne({ where: { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'ABIERTA') {
        throw new Error('La venta ya no está abierta');
      }

      await this.salesRepo.update(id, {
        formaPago: data.formaPago as any,
        montoRecibido: data.montoRecibido,
        cambio: data.cambio,
        status: 'PAGADA',
      });

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.pay error:', error);
      throw new Error(`Error al procesar pago: ${error.message}`);
    }
  }

  async cancel(id: string, motivo: string) {
    try {
      const sale = await this.salesRepo.findOne({ where: { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status === 'CANCELADA') {
        throw new Error('La venta ya está cancelada');
      }

      await this.salesRepo.update(id, {
        status: 'CANCELADA',
        motivoCancelacion: motivo,
      });

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.cancel error:', error);
      throw new Error(`Error al cancelar venta: ${error.message}`);
    }
  }

  async applyDiscount(id: string, descuento: number, nuevoTotal: number) {
    try {
      const sale = await this.salesRepo.findOne({ where: { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'ABIERTA') {
        throw new Error('Solo se puede aplicar descuento a ventas abiertas');
      }

      await this.salesRepo.update(id, {
        descuento,
        total: nuevoTotal,
      });

      return this.salesRepo.findOne({ where: { id } });
    } catch (error) {
      console.error('SalesService.applyDiscount error:', error);
      throw new Error(`Error al aplicar descuento: ${error.message}`);
    }
  }

  async returnSale(id: string, data: {
    items: SaleItem[];
    motivo: string;
    montoDevolucion: number;
  }) {
    try {
      const sale = await this.salesRepo.findOne({ where: { id } });
      if (!sale) {
        throw new Error('Venta no encontrada');
      }
      if (sale.status !== 'PAGADA') {
        throw new Error('Solo se puede devolver ventas pagadas');
      }

      // Create a new return sale record
      const folio = await this.generateFolio();
      const now = new Date();
      const returnSale = this.salesRepo.create({
        folio: `${folio}-DEV`,
        fecha: now,
        hora: now.toTimeString().slice(0, 8),
        items: data.items,
        subtotal: -data.montoDevolucion,
        descuento: 0,
        impuestos: 0,
        total: -data.montoDevolucion,
        formaPago: 'CORTESIA',
        status: 'PAGADA',
        cajero: sale.cajero,
        turnoId: sale.turnoId,
        sucursalId: sale.sucursalId,
        tenantId: sale.tenantId,
        notas: `Devolución de venta ${sale.folio}. Motivo: ${data.motivo}`,
        referencia: sale.folio,
      });

      return this.salesRepo.save(returnSale);
    } catch (error) {
      console.error('SalesService.returnSale error:', error);
      throw new Error(`Error al procesar devolución: ${error.message}`);
    }
  }
}
