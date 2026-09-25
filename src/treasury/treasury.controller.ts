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
  @Modulo('compras')
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

  // Auditoría BUSINESS (recomendación #3, seguimiento): GET/POST /treasury/transfers se
  // retiraron — duplicaban y desincronizaban TransfersService (createTransfer() nunca creaba
  // una fila en la tabla `transfer`, así que getTransferHistory() jamás mostraba lo que ahí
  // se creaba; el selector "INTERCOMPAÑIA" del formulario no tenía efecto porque
  // createTransfer() ni siquiera leía ese campo, saltándose por completo el flujo de
  // autorización que sí exige TransfersService; y esta vía nunca recibió el fix de
  // aislamiento de tenant del hallazgo #1). El frontend (TreasuryPage.tsx, tab "Traslados")
  // ahora usa GET/POST /transfers, igual que la página dedicada de Transferencias.

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
