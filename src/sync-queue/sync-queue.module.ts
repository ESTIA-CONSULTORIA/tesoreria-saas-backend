import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SyncQueue } from './entities/sync-queue.entity';
import { SyncQueueService } from './sync-queue.service';
import { SyncQueueController } from './sync-queue.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SyncQueue])],
  providers: [SyncQueueService],
  controllers: [SyncQueueController],
  exports: [SyncQueueService],
})
export class SyncQueueModule {}
