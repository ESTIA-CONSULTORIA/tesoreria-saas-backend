import { Module } from '@nestjs/common';

import { RealtimeGateway } from './gateways/realtime.gateway';
import { DashboardBroadcastService } from './services/dashboard-broadcast.service';
import { KpiStreamService } from './services/kpi-stream.service';

@Module({
  providers: [
    RealtimeGateway,
    DashboardBroadcastService,
    KpiStreamService,
  ],
  exports: [
    RealtimeGateway,
    DashboardBroadcastService,
    KpiStreamService,
  ],
})
export class RealtimeModule {}
