import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PurchaseInventoryService } from './purchase-inventory.service';
import { DashboardBroadcastService } from '../../realtime/services/dashboard-broadcast.service';
import { PostingEngineService } from '../../accounting/services/posting-engine.service';
import { TreasuryMovementService } from '../../treasury/services/treasury-movement.service';

@Injectable()
export class PurchaseFlowService {
  constructor(
    private readonly purchaseInventoryService: PurchaseInventoryService,
    private readonly dashboardBroadcastService: DashboardBroadcastService,
    private readonly postingEngineService: PostingEngineService,
    private readonly treasuryMovementService: TreasuryMovementService,
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

    await this.postingEngineService.postPurchase({
      purchaseId,
      total: payload.total,
      taxes: 0,
    });

    await this.treasuryMovementService.registerPurchaseExpense({
      tenantId: payload.tenantId,
      companyId: payload.companyId,
      branchId: payload.branchId,
      purchaseId,
      amount: payload.total,
      currency: payload.currency,
    });

    await this.dashboardBroadcastService.broadcastPurchaseCreated({
      tenantId: payload.tenantId,
      companyId: payload.companyId,
      branchId: payload.branchId,
      purchaseId,
      total: payload.total,
    });

    return {
      success: true,
      purchaseId,
      status: 'CREATED',
    };
  }
}
