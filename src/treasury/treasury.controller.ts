import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request } from '@nestjs/common';
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

  // Scheduled Payments CRUD
  @Get('scheduled-payments')
  getScheduledPayments(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getScheduledPayments(tenantId);
  }

  @Post('scheduled-payments')
  createScheduledPayment(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.createScheduledPayment({ ...data, tenantId });
  }

  @Put('scheduled-payments/:id')
  updateScheduledPayment(@Param('id') id: string, @Body() data: any) {
    return this.treasuryService.updateScheduledPayment(id, data);
  }

  @Delete('scheduled-payments/:id')
  deleteScheduledPayment(@Param('id') id: string) {
    return this.treasuryService.deleteScheduledPayment(id);
  }

  // Transfers
  @Post('transfers')
  createTransfer(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.createTransfer({ ...data, tenantId });
  }

  // Accounts Payable (CxP)
  @Get('accounts-payable')
  getAccountsPayable(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    console.log('tenantId del JWT:', tenantId);
    console.log('req.user:', req.user);
    return this.treasuryService.getAccountsPayable(tenantId);
  }

  // Accounts Receivable (CxC)
  @Get('accounts-receivable')
  getAccountsReceivable(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getAccountsReceivable(tenantId);
  }

  // Alert Configuration
  @Get('alert-config')
  getAlertConfig(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getAlertConfig(tenantId);
  }

  @Put('alert-config')
  updateAlertConfig(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.updateAlertConfig({ ...data, tenantId });
  }
}
