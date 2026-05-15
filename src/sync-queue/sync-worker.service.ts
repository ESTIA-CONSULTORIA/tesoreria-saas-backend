import { Injectable } from '@nestjs/common';

import { SyncQueueService } from './sync-queue.service';
import { SyncQueue } from './entities/sync-queue.entity';

@Injectable()
export class SyncWorkerService {
  constructor(private syncQueueService: SyncQueueService) {}

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
    // This is the orchestration layer.
    // Future handlers will process by module/operationType, for example:
    // SALES + CREATE -> create sale and movements
    // INVENTORY + UPDATE -> adjust stock
    // TREASURY + CREATE -> create movement
    // POS + CREATE -> import POS ticket
    switch (item.module) {
      case 'SALES':
      case 'INVENTORY':
      case 'TREASURY':
      case 'POS':
        return true;
      default:
        throw new Error(`Unsupported sync module: ${item.module}`);
    }
  }
}
