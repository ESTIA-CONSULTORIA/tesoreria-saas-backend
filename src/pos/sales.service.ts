import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleItem } from './entities/sale.entity';
import { Product } from './entities/product.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';

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

  async create(data: {
    items: SaleItem[];
    subtotal: number;
    descuento: number;
    impuestos: number;
    total: number;
    metodoPago?: string;
    metodosPago?: any[];
    cajero: string;
    turnoId: string;
    sucursalId: string;
    tenantId: string;
    notas?: string;
    referencia?: string;
  }) {
    try {
      console.log('SalesService.create - turnoId recibido:', data.turnoId);
      console.log('SalesService.create - data completo:', data);
      
      const folio = await this.generateFolio();
      const now = new Date();
      const sale = this.salesRepo.create();
      sale.folio = folio;
      sale.fecha = now;
      sale.hora = now.toTimeString().slice(0, 8);
      sale.items = data.items;
      sale.subtotal = data.subtotal;
      sale.descuento = data.descuento;
      sale.impuestos = data.impuestos;
      sale.total = data.total;
      sale.metodoPago = (data.metodoPago || data.metodosPago?.[0]?.metodo) as any;
      sale.status = 'ABIERTA';
      sale.cajero = data.cajero;
      sale.turnoId = data.turnoId;
      sale.sucursalId = data.sucursalId;
      sale.tenantId = data.tenantId;
      sale.notas = data.notas || '';
      sale.referencia = data.referencia || '';
      
      const savedSale = await this.salesRepo.save(sale);
      
      // Deduct inventory for each product sold
      await this.deductInventory(data.items, folio);
      
      return savedSale;
    } catch (error) {
      console.error('SalesService.create error:', error);
      throw new Error(`Error al crear venta: ${error.message}`);
    }
  }

  private async deductInventory(items: SaleItem[], folio: string) {
    for (const item of items) {
      const product = await this.productRepo.findOne({ where: { id: item.productoId } });
      if (!product) continue;

      if (product.type === 'PREPARADO' && product.recipeId) {
        // Deduct recipe ingredients
        await this.deductRecipeIngredients(product.recipeId, item.cantidad, folio);
      } else if (product.type === 'SIMPLE' && product.insumoId) {
        // Deduct single insumo
        await this.deductInsumo(product.insumoId, item.cantidad, folio);
      }
    }
  }

  private async deductRecipeIngredients(recipeId: string, quantity: number, folio: string) {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe || !recipe.items) return;

    for (const item of recipe.items) {
      await this.deductInsumo(item.insumoId, item.cantidad * quantity, folio);
    }
  }

  private async deductInsumo(insumoId: string, quantity: number, folio: string) {
    const insumo = await this.insumoRepo.findOne({ where: { id: insumoId } });
    if (!insumo) return;

    const newStock = Math.max(0, Number(insumo.stockActual) - quantity);
    await this.insumoRepo.update(insumoId, { stockActual: newStock });

    // Check if stock is at or below minimum
    if (newStock <= Number(insumo.stockMinimo)) {
      console.warn(`⚠️ Alerta: Insumo ${insumo.nombre} está en stock mínimo o bajo. Stock actual: ${newStock}, Mínimo: ${insumo.stockMinimo}`);
      // TODO: Create alert in system
    }

    // TODO: Register inventory movement type SALIDA_VENTA
    console.log(`📦 Movimiento inventario: SALIDA_VENTA - Insumo: ${insumo.nombre}, Cantidad: ${quantity}, Referencia: ${folio}, Stock resultante: ${newStock}`);
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
    metodoPago: string;
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
        metodoPago: data.metodoPago as any,
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
        metodoPago: 'CORTESIA',
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
