import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis(@Query('period') period?: string) {
    return this.dashboardService.getKpis(period);
  }
}
