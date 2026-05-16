import { Injectable } from '@nestjs/common';

@Injectable()
export class TreasuryMovementService {
  async registerSaleIncome(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    amount: number;
    currency?: string;
  }) {
    // Future implementation:
    // - cash movement
    // - bank movement
    // - projected liquidity
    // - reconciliation pending record

    return {
      success: true,
      movementType: 'SALE_INCOME',
      saleId: payload.saleId,
      amount: payload.amount,
    };
  }
}
