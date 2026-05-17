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
    return {
      success: true,
      movementType: 'SALE_INCOME',
      saleId: payload.saleId,
      amount: payload.amount,
    };
  }

  async registerPurchaseExpense(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    purchaseId: string;
    amount: number;
    currency?: string;
  }) {
    return {
      success: true,
      movementType: 'PURCHASE_EXPENSE',
      purchaseId: payload.purchaseId,
      amount: payload.amount,
    };
  }
}
