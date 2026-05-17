import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PurchaseInventoryService } from './purchase-inventory.service';
import { DashboardBroadcastService } from '../../realtime/services/dashboard-broadcast.service';

@Injectable()
export class PurchaseFlowService {
  constructor(
    private readonly purchaseInventoryService: PurchaseInventoryService,
    private readonly dashboardBroadcastService: DashboardBroadcastService,
  ) {}

  async createPurchase(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    supplierId?: string;
    total: number;
    currency?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitCost: number;
    }>;
  }) {
    const purchaseId = randomUUID();

    for (const item of payload.items) {
      await this.purchaseInventoryService.receiveInventory({
        purchaseId,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
      });
    }

    await this.dashboardBroadcastService.broadcastSaleCreated({
      tenantId: payload.tenantId,
      companyId: payload.companyId,
      branchId: payload.branchId,
      saleId: purchaseId,
      total: payload.total,
    });

    return {
      success: true,
      purchaseId,
      status: 'CREATED',
    };
  }
}
