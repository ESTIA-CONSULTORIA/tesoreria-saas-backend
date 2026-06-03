import { Controller, Get, Query, Request } from '@nestjs/common';
import { TreasuryService } from './treasury.service';

@Controller('treasury')
export class TreasuryController {
  constructor(private treasuryService: TreasuryService) {}

  @Get('executive-summary')
  getExecutiveSummary(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getExecutiveSummary(tenantId);
  }

  @Get('cash-flow-forecast')
  getCashFlowForecast(@Query('days') days?: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId || req?.tenantId;
    return this.treasuryService.getCashFlowForecast(days ? parseInt(days) : 30, tenantId);
  }

  @Get('bank-position')
  getBankPosition(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getBankPosition(tenantId);
  }

  @Get('alerts')
  getAlerts(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getAlerts(tenantId);
  }
}
