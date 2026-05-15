import { Injectable } from '@nestjs/common';

import { SyncQueue } from '../entities/sync-queue.entity';

@Injectable()
export class PosSyncHandler {
  async handle(item: SyncQueue) {
    // Future implementation:
    // - import POS tickets
    // - synchronize orders
    // - synchronize payments
    // - synchronize discounts and courtesies
    // - synchronize cashier cuts
    return {
      module: item.module,
      operationType: item.operationType,
      handled: true,
    };
  }
}
