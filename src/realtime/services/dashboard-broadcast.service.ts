import { Injectable } from '@nestjs/common';

@Injectable()
export class DashboardBroadcastService {
  async broadcastSaleCreated(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    total: number;
  }) {
    return {
      success: true,
      broadcasted: true,
      event: 'sale.created',
      payload,
    };
  }

  async broadcastPurchaseCreated(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    purchaseId: string;
    total: number;
  }) {
    return {
      success: true,
      broadcasted: true,
      event: 'purchase.created',
      payload,
    };
  }
}
