import { Injectable } from '@nestjs/common';

@Injectable()
export class TreasurySubscriber {
  async handle(eventName: string, payload: any) {
    // Future implementation:
    // - sale.created -> treasury income movement
    // - payment.received -> cash flow update
    // - refund.processed -> cash out movement
    // - bank.reconciled -> liquidity update

    return {
      success: true,
      subscriber: 'treasury',
      eventName,
      handled: true,
    };
  }
}
