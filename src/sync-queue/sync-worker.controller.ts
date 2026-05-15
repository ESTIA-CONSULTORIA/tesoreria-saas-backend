import { Controller, Post } from '@nestjs/common';

import { SyncWorkerService } from './sync-worker.service';

@Controller('sync-worker')
export class SyncWorkerController {
  constructor(private syncWorkerService: SyncWorkerService) {}

  @Post('process')
  processPending() {
    return this.syncWorkerService.processPending();
  }
}
