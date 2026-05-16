import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountingSubscriber {
  async handle(eventName: string, payload: any) {
    // Future implementation:
    // - sale.created -> accounting posting
    // - purchase.created -> AP posting
    // - payment.received -> treasury reconciliation posting
    // - inventory.adjusted -> inventory accounting impact

    return {
      success: true,
      subscriber: 'accounting',
      eventName,
      handled: true,
    };
  }
}
