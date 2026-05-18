import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class DashboardBroadcastService {
  async broadcastSaleCreated(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    total: number;
  }) {
    if (!payload.tenantId || !payload.companyId) {
      throw new BadRequestException(
        'Contexto SaaS inválido',
      );
    }

    if (!payload.saleId) {
      throw new BadRequestException(
        'SaleId requerido',
      );
    }

    if (Number(payload.total || 0) <= 0) {
      throw new BadRequestException(
        'Total inválido',
      );
    }

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
    if (!payload.tenantId || !payload.companyId) {
      throw new BadRequestException(
        'Contexto SaaS inválido',
      );
    }

    if (!payload.purchaseId) {
      throw new BadRequestException(
        'PurchaseId requerido',
      );
    }

    if (Number(payload.total || 0) <= 0) {
      throw new BadRequestException(
        'Total inválido',
      );
    }

    return {
      success: true,
      broadcasted: true,
      event: 'purchase.created',
      payload,
    };
  }
}
