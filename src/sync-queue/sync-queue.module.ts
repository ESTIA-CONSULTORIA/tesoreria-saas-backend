import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SyncQueue } from './entities/sync-queue.entity';
import { SyncQueueService } from './sync-queue.service';
import { SyncQueueController } from './sync-queue.controller';
import { SyncWorkerService } from './sync-worker.service';
import { SyncWorkerController } from './sync-worker.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SyncQueue])],
  providers: [SyncQueueService, SyncWorkerService],
  controllers: [SyncQueueController, SyncWorkerController],
  exports: [SyncQueueService, SyncWorkerService],
})
export class SyncQueueModule {}
