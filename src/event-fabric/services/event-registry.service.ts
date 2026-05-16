import { Injectable } from '@nestjs/common';

@Injectable()
export class EventRegistryService {
  private readonly registeredEvents = [
    'sale.created',
    'payment.received',
    'inventory.updated',
    'bank.reconciled',
    'sync.failed',
    'document.generated',
    'workflow.approved',
  ];

  getRegisteredEvents() {
    return this.registeredEvents;
  }

  isRegistered(eventName: string) {
    return this.registeredEvents.includes(eventName);
  }
}
