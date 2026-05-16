import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { ReportingService } from './reporting.service';
import { KpiSnapshot } from './entities/kpi-snapshot.entity';

@Controller('reporting')
export class ReportingController {
  constructor(private reportingService: ReportingService) {}

  @Post('snapshot')
  createSnapshot(@Body() body: Partial<KpiSnapshot>) {
    return this.reportingService.createSnapshot(body);
  }

  @Get('snapshots')
  findSnapshots(@Query('metric') metric?: string) {
    return this.reportingService.findRecentSnapshots(metric);
  }

  @Get('dashboard-summary')
  getDashboardSummary() {
    return this.reportingService.getDashboardSummary();
  }
}
