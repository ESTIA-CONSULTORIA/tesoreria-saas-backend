import { Controller, Get, Query } from '@nestjs/common';
import { TreasuryService } from './treasury.service';

@Controller('treasury')
export class TreasuryController {
  constructor(private treasuryService: TreasuryService) {}

  @Get('executive-summary')
  getExecutiveSummary() {
    return this.treasuryService.getExecutiveSummary();
  }

  @Get('cash-flow-forecast')
  getCashFlowForecast(@Query('days') days?: string) {
    return this.treasuryService.getCashFlowForecast(days ? parseInt(days) : 30);
  }

  @Get('bank-position')
  getBankPosition() {
    return this.treasuryService.getBankPosition();
  }

  @Get('alerts')
  getAlerts() {
    return this.treasuryService.getAlerts();
  }
}
