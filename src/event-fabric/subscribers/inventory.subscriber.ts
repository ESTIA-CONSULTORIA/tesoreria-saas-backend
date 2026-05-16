import { Injectable } from '@nestjs/common';

@Injectable()
export class InventorySubscriber {
  async handle(eventName: string, payload: any) {
    // Future implementation:
    // - sale.created -> inventory consumption
    // - purchase.received -> stock increase
    // - inventory.adjusted -> stock correction
    // - production.completed -> finished goods increase

    return {
      success: true,
      subscriber: 'inventory',
      eventName,
      handled: true,
    };
  }
}
