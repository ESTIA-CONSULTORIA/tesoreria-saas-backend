import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SyncQueue } from './entities/sync-queue.entity';
import { SyncQueueService } from './sync-queue.service';
import { SyncQueueController } from './sync-queue.controller';
import { SyncWorkerService } from './sync-worker.service';
import { SyncWorkerController } from './sync-worker.controller';
import { TreasurySyncHandler } from './handlers/treasury-sync.handler';
import { PosSyncHandler } from './handlers/pos-sync.handler';
import { InventorySyncHandler } from './handlers/inventory-sync.handler';

@Module({
  imports: [TypeOrmModule.forFeature([SyncQueue])],
  providers: [
    SyncQueueService,
    SyncWorkerService,
    TreasurySyncHandler,
    PosSyncHandler,
    InventorySyncHandler,
  ],
  controllers: [SyncQueueController, SyncWorkerController],
  exports: [SyncQueueService, SyncWorkerService],
})
export class SyncQueueModule {}
