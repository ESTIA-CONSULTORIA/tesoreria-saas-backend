import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { TreasuryMovementService } from '../../treasury/services/treasury-movement.service';
import { DashboardBroadcastService } from '../../realtime/services/dashboard-broadcast.service';
import { InventoryService } from '../../inventory/inventory.service';
import { PostingEngineService } from '../../accounting/services/posting-engine.service';

@Injectable()
export class SalesFlowService {
  constructor(
    private readonly treasuryMovementService: TreasuryMovementService,
    private readonly dashboardBroadcastService: DashboardBroadcastService,
    private readonly inventoryService: InventoryService,
    private readonly postingEngineService: PostingEngineService,
  ) {}

  async createSale(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    customerId?: string;
    total: number;
    currency?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>;
  }) {
    if (!payload.tenantId || !payload.companyId) {
      throw new BadRequestException(
        'Contexto SaaS inválido',
      );
    }

    if (!payload.items?.length) {
      throw new BadRequestException(
        'La venta requiere items',
      );
    }

    const calculatedTotal = payload.items.reduce(
      (acc, item) => {
        return acc + item.quantity * item.unitPrice;
      },
      0,
    );

    if (Math.abs(calculatedTotal - payload.total) > 0.01) {
      throw new BadRequestException(
        'El total no coincide con los items',
      );
    }

    const saleId = randomUUID();

    for (const item of payload.items) {
      await this.inventoryService.registerMovement({
        productId: item.productId,
        quantity: item.quantity,
        type: 'SALE',
        reference: saleId,
      });
    }

    await this.treasuryMovementService.registerSaleIncome({
      tenantId: payload.tenantId,
      companyId: payload.companyId,
      branchId: payload.branchId,
      saleId,
      amount: payload.total,
      currency: payload.currency,
    });

    await this.postingEngineService.postSale({
      saleId,
      total: payload.total,
      taxes: 0,
    });

    await this.dashboardBroadcastService.broadcastSaleCreated({
      tenantId: payload.tenantId,
      companyId: payload.companyId,
      branchId: payload.branchId,
      saleId,
      total: payload.total,
    });

    return {
      success: true,
      saleId,
      total: payload.total,
      status: 'CREATED',
    };
  }
}
