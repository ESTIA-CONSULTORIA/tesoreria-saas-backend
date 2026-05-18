import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../security/guards/tenant.guard';
import { SalesFlowService } from '../services/sales-flow.service';

@Controller('sales/flow')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SalesFlowController {
  constructor(private readonly salesFlowService: SalesFlowService) {}

  @Post()
  async createSale(
    @Req() request: any,
    @Body()
    payload: {
      customerId?: string;
      total: number;
      currency?: string;
      items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
      }>;
    },
  ) {
    return this.salesFlowService.createSale({
      tenantId: request.user.tenantId,
      companyId: request.user.companyId,
      branchId: request.user.branchId,
      ...payload,
    });
  }
}
