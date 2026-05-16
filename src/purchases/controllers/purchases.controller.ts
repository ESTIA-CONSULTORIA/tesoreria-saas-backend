import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../security/guards/tenant.guard';
import { PurchaseFlowService } from '../services/purchase-flow.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PurchasesController {
  constructor(private readonly purchaseFlowService: PurchaseFlowService) {}

  @Post()
  async createPurchase(
    @Req() request: any,
    @Body()
    payload: {
      supplierId?: string;
      total: number;
      currency?: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitCost: number;
      }>;
    },
  ) {
    return this.purchaseFlowService.createPurchase({
      tenantId: request.user.tenantId,
      companyId: request.user.companyId,
      branchId: request.user.branchId,
      ...payload,
    });
  }
}
