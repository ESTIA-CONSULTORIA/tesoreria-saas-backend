import { Injectable } from '@nestjs/common';

@Injectable()
export class TimelineRegistrationService {
  async registerSaleEvent(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    amount: number;
    currency?: string;
  }) {
    // Future implementation:
    // - persist timeline event
    // - connect treasury flow
    // - connect accounting flow
    // - connect reconciliation flow

    return {
      success: true,
      timelineRegistered: true,
      eventType: 'SALE_CREATED',
    };
  }
}
