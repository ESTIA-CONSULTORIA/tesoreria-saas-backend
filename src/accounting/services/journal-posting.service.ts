import { Injectable } from '@nestjs/common';

@Injectable()
export class JournalPostingService {
  async registerSalePosting(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    amount: number;
    currency?: string;
  }) {
    // Future implementation:
    // - journal entries
    // - tax entries
    // - ledger posting
    // - financial statement impact

    return {
      success: true,
      postingType: 'SALE_POSTING',
      saleId: payload.saleId,
    };
  }
}
