import { Controller, Get, Post, Put, Delete, Body, Headers, Param, Query, Request } from '@nestjs/common';
import { TreasuryService } from './treasury.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('treasury')
export class TreasuryController {
  constructor(private treasuryService: TreasuryService) {}

  @Get('executive-summary')
  @Modulo('tesoreria')
  getExecutiveSummary(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getExecutiveSummary(tenantId, branchId, companyId);
  }

  @Get('cash-flow-forecast')
  @Modulo('tesoreria')
  getCashFlowForecast(@Query('days') days?: string, @Request() req?: any, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req?.user?.tenantId || req?.tenantId;
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getCashFlowForecast(days ? parseInt(days) : 30, tenantId, branchId, companyId);
  }

  @Get('bank-position')
  @Modulo('tesoreria')
  getBankPosition(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getBankPosition(tenantId, branchId, companyId);
  }

  @Get('alerts')
  @Modulo('tesoreria')
  getAlerts(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getAlerts(tenantId, branchId, companyId);
  }

  @Get('aging-report')
  getAgingReport(@Request() req, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId;
    const companyId = req.user?.companyId || headerCompanyId;
    return this.treasuryService.getAgingReport(tenantId, companyId);
  }

  @Get('pending-deposits')
  @Modulo('tesoreria')
  getPendingDeposits(@Request() req, @Headers('x-branch-id') headerBranchId?: string) {
    const tenantId = req.user?.tenantId;
    const branchId = req.user?.branchId || headerBranchId;
    return this.treasuryService.getPendingDeposits(tenantId, branchId);
  }

  @Post('confirm-deposit/:shiftId')
  @Modulo('tesoreria')
  confirmDeposit(@Param('shiftId') shiftId: string, @Body() body: { bankId: string; amount: number }, @Request() req) {
    const tenantId = req.user?.tenantId;
    return this.treasuryService.confirmDeposit(shiftId, tenantId, body.bankId, body.amount);
  }

  // Scheduled Payments CRUD
  @Get('scheduled-payments')
  @Modulo('tesoreria')
  getScheduledPayments(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getScheduledPayments(tenantId, branchId, companyId);
  }

  @Post('scheduled-payments')
  @Modulo('tesoreria')
  createScheduledPayment(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.createScheduledPayment({ ...data, tenantId });
  }

  @Put('scheduled-payments/:id')
  @Modulo('tesoreria')
  updateScheduledPayment(@Param('id') id: string, @Body() data: any) {
    return this.treasuryService.updateScheduledPayment(id, data);
  }

  @Delete('scheduled-payments/:id')
  @Modulo('tesoreria')
  deleteScheduledPayment(@Param('id') id: string) {
    return this.treasuryService.deleteScheduledPayment(id);
  }

  // Transfers
  @Get('transfers')
  @Modulo('tesoreria')
  getTransferHistory(@Request() req, @Query('limit') limit?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getTransferHistory(tenantId, limit ? parseInt(limit) : 20);
  }

  @Post('transfers')
  @Modulo('tesoreria')
  createTransfer(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.createTransfer({ ...data, tenantId });
  }

  // Accounts Payable (CxP)
  @Get('accounts-payable')
  @Modulo('tesoreria')
  getAccountsPayable(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getAccountsPayable(tenantId, branchId, companyId);
  }

  // Accounts Receivable (CxC)
  @Get('accounts-receivable')
  @Modulo('tesoreria')
  getAccountsReceivable(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getAccountsReceivable(tenantId, branchId, companyId);
  }

  // Alert Configuration
  @Get('alert-config')
  @Modulo('tesoreria')
  getAlertConfig(@Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getAlertConfig(tenantId);
  }

  @Put('alert-config')
  @Modulo('tesoreria')
  updateAlertConfig(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.updateAlertConfig({ ...data, tenantId });
  }
}
