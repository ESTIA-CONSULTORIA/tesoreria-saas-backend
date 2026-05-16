import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountingPostingService {
  async registerSalePosting(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    amount: number;
    currency?: string;
  }) {
    // Future implementation:
    // - debit cash/accounts receivable
    // - credit sales revenue
    // - tax posting
    // - inventory/cost posting
    // - journal persistence

    return {
      success: true,
      postingType: 'SALE_POSTING',
      saleId: payload.saleId,
    };
  }
}
