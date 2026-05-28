import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { Purchase } from './entities/purchase.entity';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private purchaseOrdersRepo: Repository<PurchaseOrder>,
    @InjectRepository(Purchase)
    private purchasesRepo: Repository<Purchase>,
  ) {}

  // Purchase Orders
  findAllOrders(tenantId?: string, status?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;

    return this.purchaseOrdersRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  findOneOrder(id: string) {
    return this.purchaseOrdersRepo.findOne({ where: { id } });
  }

  createOrder(data: Partial<PurchaseOrder>) {
    const order = this.purchaseOrdersRepo.create(data);
    return this.purchaseOrdersRepo.save(order);
  }

  async updateOrder(id: string, data: Partial<PurchaseOrder>) {
    await this.purchaseOrdersRepo.update(id, data);
    return this.purchaseOrdersRepo.findOne({ where: { id } });
  }

  async markOrderAsSent(id: string) {
    await this.purchaseOrdersRepo.update(id, { status: 'ENVIADA' });
    return this.purchaseOrdersRepo.findOne({ where: { id } });
  }

  async cancelOrder(id: string) {
    await this.purchaseOrdersRepo.update(id, { status: 'CANCELADA' });
    return this.purchaseOrdersRepo.findOne({ where: { id } });
  }

  async receiveOrder(id: string, receivedItems: any[]) {
    const order = await this.purchaseOrdersRepo.findOne({ where: { id } });
    if (!order) return null;

    // Actualizar items con cantidades recibidas
    const updatedItems = order.items.map((item: any) => {
      const received = receivedItems.find((r) => r.descripcion === item.descripcion);
      return {
        ...item,
        cantidadRecibida: received ? received.cantidadRecibida : 0,
      };
    });

    // Determinar status basado en recepción
    const allReceived = updatedItems.every((item: any) => item.cantidadRecibida >= item.cantidad);
    const someReceived = updatedItems.some((item: any) => item.cantidadRecibida > 0);
    const newStatus = allReceived ? 'RECIBIDA' : someReceived ? 'PARCIAL' : 'ENVIADA';

    await this.purchaseOrdersRepo.update(id, {
      items: updatedItems,
      status: newStatus,
    });

    return this.purchaseOrdersRepo.findOne({ where: { id } });
  }

  async deleteOrder(id: string) {
    await this.purchaseOrdersRepo.delete(id);
  }

  // Purchases (Facturas)
  findAllPurchases(tenantId?: string, status?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;

    return this.purchasesRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  findOnePurchase(id: string) {
    return this.purchasesRepo.findOne({ where: { id } });
  }

  createPurchase(data: Partial<Purchase>) {
    const purchase = this.purchasesRepo.create(data);
    return this.purchasesRepo.save(purchase);
  }

  async updatePurchase(id: string, data: Partial<Purchase>) {
    await this.purchasesRepo.update(id, data);
    return this.purchasesRepo.findOne({ where: { id } });
  }

  async registerPayment(id: string, amount: number) {
    const purchase = await this.purchasesRepo.findOne({ where: { id } });
    if (!purchase) return null;

    const newMontoPagado = Number(purchase.montoPagado) + amount;
    const newStatus = newMontoPagado >= Number(purchase.total) ? 'PAGADA' : 'PARCIAL';

    await this.purchasesRepo.update(id, {
      montoPagado: newMontoPagado,
      status: newStatus,
    });

    return this.purchasesRepo.findOne({ where: { id } });
  }

  async deletePurchase(id: string) {
    await this.purchasesRepo.delete(id);
  }

  // Cuentas por Pagar (agrupadas por proveedor)
  async getAccountsPayable(tenantId?: string) {
    const where: any = { status: In(['PENDIENTE', 'PARCIAL']) };
    if (tenantId) where.tenantId = tenantId;

    const purchases = await this.purchasesRepo.find({
      where,
      order: { fechaVencimiento: 'ASC' },
    });

    // Agrupar por proveedor
    const grouped: any = {};
    purchases.forEach((purchase) => {
      const supplierId = purchase.supplierId || 'sin-proveedor';
      if (!grouped[supplierId]) {
        grouped[supplierId] = {
          supplierId,
          totalPendiente: 0,
          facturas: [],
        };
      }
      grouped[supplierId].totalPendiente += Number(purchase.total) - Number(purchase.montoPagado);
      grouped[supplierId].facturas.push(purchase);
    });

    return Object.values(grouped);
  }
}
