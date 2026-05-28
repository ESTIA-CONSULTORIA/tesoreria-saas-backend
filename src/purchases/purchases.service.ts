import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  findAllOrders(tenantId?: string) {
    return this.purchaseOrdersRepo.find({
      where: tenantId ? { tenantId } : undefined,
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

  async deleteOrder(id: string) {
    await this.purchaseOrdersRepo.delete(id);
  }

  // Purchases (Facturas)
  findAllPurchases(tenantId?: string) {
    return this.purchasesRepo.find({
      where: tenantId ? { tenantId } : undefined,
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

  async deletePurchase(id: string) {
    await this.purchasesRepo.delete(id);
  }
}
