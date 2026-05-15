import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { SyncQueueService } from './sync-queue.service';
import { SyncQueue } from './entities/sync-queue.entity';

@Controller('sync-queue')
export class SyncQueueController {
  constructor(private syncQueueService: SyncQueueService) {}

  @Post()
  enqueue(@Body() body: Partial<SyncQueue>) {
    return this.syncQueueService.enqueue(body);
  }

  @Get('pending')
  findPending() {
    return this.syncQueueService.findPending();
  }

  @Patch(':id/synced')
  markAsSynced(@Param('id') id: string) {
    return this.syncQueueService.markAsSynced(id);
  }
}
