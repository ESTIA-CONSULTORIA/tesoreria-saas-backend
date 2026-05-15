import { Injectable } from '@nestjs/common';

import { SyncQueueService } from './sync-queue.service';
import { SyncQueue } from './entities/sync-queue.entity';
import { TreasurySyncHandler } from './handlers/treasury-sync.handler';
import { PosSyncHandler } from './handlers/pos-sync.handler';
import { InventorySyncHandler } from './handlers/inventory-sync.handler';

@Injectable()
export class SyncWorkerService {
  constructor(
    private syncQueueService: SyncQueueService,
    private treasurySyncHandler: TreasurySyncHandler,
    private posSyncHandler: PosSyncHandler,
    private inventorySyncHandler: InventorySyncHandler,
  ) {}

  async processPending() {
    const pendingItems = await this.syncQueueService.findPending();

    const results: Array<{
      id: string;
      status: string;
      message?: string;
    }> = [];

    for (const item of pendingItems) {
      const result = await this.processItem(item);
      results.push(result);
    }

    return {
      processed: results.length,
      results,
    };
  }

  private async processItem(item: SyncQueue) {
    try {
      await this.syncQueueService.markAsProcessing(item.id);

      await this.routeOperation(item);

      await this.syncQueueService.markAsSynced(item.id);

      return {
        id: item.id,
        status: 'SYNCED',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';

      await this.syncQueueService.markAsError(item.id, message);

      return {
        id: item.id,
        status: 'ERROR',
        message,
      };
    }
  }

  private async routeOperation(item: SyncQueue) {
    switch (item.module) {
      case 'TREASURY':
        return this.treasurySyncHandler.handle(item);

      case 'POS':
      case 'SALES':
        return this.posSyncHandler.handle(item);

      case 'INVENTORY':
        return this.inventorySyncHandler.handle(item);

      default:
        throw new Error(`Unsupported sync module: ${item.module}`);
    }
  }
}
