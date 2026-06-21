import { Controller, Get, Post, Put, Delete, Body, Headers, Param, Query, Request } from '@nestjs/common';
import { TreasuryService } from './treasury.service';

@Controller('treasury')
export class TreasuryController {
  constructor(private treasuryService: TreasuryService) {}

  @Get('executive-summary')
  getExecutiveSummary(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getExecutiveSummary(tenantId, branchId, companyId);
  }

  @Get('cash-flow-forecast')
  getCashFlowForecast(@Query('days') days?: string, @Request() req?: any, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req?.user?.tenantId || req?.tenantId;
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getCashFlowForecast(days ? parseInt(days) : 30, tenantId, branchId, companyId);
  }

  @Get('bank-position')
  getBankPosition(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getBankPosition(tenantId, branchId, companyId);
  }

  @Get('alerts')
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
  getPendingDeposits(@Request() req, @Headers('x-branch-id') headerBranchId?: string) {
    const tenantId = req.user?.tenantId;
    const branchId = req.user?.branchId || headerBranchId;
    return this.treasuryService.getPendingDeposits(tenantId, branchId);
  }

  @Post('confirm-deposit/:shiftId')
  confirmDeposit(@Param('shiftId') shiftId: string, @Body() body: { bankId: string; amount: number }, @Request() req) {
    const tenantId = req.user?.tenantId;
    return this.treasuryService.confirmDeposit(shiftId, tenantId, body.bankId, body.amount);
  }

  // Scheduled Payments CRUD
  @Get('scheduled-payments')
  getScheduledPayments(@Request() req, @Headers('x-branch-id') headerBranchId?: string, @Headers('x-company-id') headerCompanyId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userBranchId = req.user?.branchId;
    const userCompanyId = req.user?.companyId;

    const branchId = userBranchId || headerBranchId;
    const companyId = userCompanyId || headerCompanyId;

    return this.treasuryService.getScheduledPayments(tenantId, branchId, companyId);
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
  @Get('transfers')
  getTransferHistory(@Request() req, @Query('limit') limit?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.getTransferHistory(tenantId, limit ? parseInt(limit) : 20);
  }

  @Post('transfers')
  createTransfer(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.treasuryService.createTransfer({ ...data, tenantId });
  }

  // Accounts Payable (CxP)
  @Get('accounts-payable')
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
