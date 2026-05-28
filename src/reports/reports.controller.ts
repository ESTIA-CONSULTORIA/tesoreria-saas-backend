import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('cash-flow')
  cashFlow(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.cashFlow(startDate, endDate);
  }

  @Get('balance-by-account')
  balanceByAccount() {
    return this.reportsService.balanceByAccount();
  }

  @Get('category-summary')
  categorySummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.categorySummary(startDate, endDate);
  }

  @Get('income-statement')
  incomeStatement(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.incomeStatement(startDate, endDate);
  }

  @Get('break-even-point')
  breakEvenPoint(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.breakEvenPoint(startDate, endDate);
  }
}
