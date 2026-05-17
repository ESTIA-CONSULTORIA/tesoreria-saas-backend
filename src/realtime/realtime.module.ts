import { Module } from '@nestjs/common';

import { DashboardBroadcastService } from './services/dashboard-broadcast.service';
import { KpiStreamService } from './services/kpi-stream.service';

@Module({
  providers: [
    DashboardBroadcastService,
    KpiStreamService,
  ],
  exports: [
    DashboardBroadcastService,
    KpiStreamService,
  ],
})
export class RealtimeModule {}
