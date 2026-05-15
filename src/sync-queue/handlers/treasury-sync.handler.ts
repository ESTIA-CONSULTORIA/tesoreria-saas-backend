import { Injectable } from '@nestjs/common';

import { SyncQueue } from '../entities/sync-queue.entity';

@Injectable()
export class TreasurySyncHandler {
  async handle(item: SyncQueue) {
    // Future implementation:
    // - create treasury movements
    // - update account balances
    // - reconcile local device operation IDs
    // - prevent duplicated cash/bank movements
    return {
      module: item.module,
      operationType: item.operationType,
      handled: true,
    };
  }
}
