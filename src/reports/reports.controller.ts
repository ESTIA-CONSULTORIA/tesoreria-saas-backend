import { Controller, Get, Query, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('cash-flow')
  cashFlow(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;
    return this.reportsService.cashFlow(startDate, endDate, tenantId);
  }

  @Get('balance-by-account')
  balanceByAccount(@Request() req) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;
    return this.reportsService.balanceByAccount(tenantId);
  }

  @Get('category-summary')
  categorySummary(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;
    return this.reportsService.categorySummary(startDate, endDate, tenantId);
  }

  @Get('income-statement')
  incomeStatement(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;
    return this.reportsService.incomeStatement(startDate, endDate, tenantId);
  }

  @Get('break-even-point')
  breakEvenPoint(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const user = req.user;
    const tenantId = req.tenantId || user?.tenantId;
    return this.reportsService.breakEvenPoint(startDate, endDate, tenantId);
  }
}
