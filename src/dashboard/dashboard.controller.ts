import { Controller, Get, Query, Headers, Request } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis(
    @Query('period') period?: string,
    @Headers('x-branch-id') branchId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    return this.dashboardService.getKpis(period, branchId, tenantId);
  }
}
