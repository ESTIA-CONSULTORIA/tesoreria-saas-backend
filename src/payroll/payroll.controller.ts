import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Request } from '@nestjs/common';
import { PayrollService } from './payroll.service';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('runs')
  createPayrollRun(
    @Body() body: { periodStart: string; periodEnd: string; periodType?: string; branchId?: string; notes?: string },
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    const companyId = headerCompanyId || req?.user?.companyId;
    const branchId = body.branchId || req?.user?.branchId;
    return this.payrollService.createPayrollRun(body, tenantId, companyId, branchId);
  }

  @Get('runs')
  listPayrollRuns(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    const companyId = headerCompanyId || req?.user?.companyId;
    return this.payrollService.listPayrollRuns(tenantId, companyId);
  }

  @Get('runs/:id')
  getPayrollRun(@Param('id') id: string) {
    return this.payrollService.getPayrollRun(id);
  }

  @Put('runs/:id/approve')
  approvePayrollRun(
    @Param('id') id: string,
    @Body() body: { approvedBy?: string },
    @Request() req?: any,
  ) {
    const approvedBy = body.approvedBy || req?.user?.email || req?.user?.id || 'admin';
    return this.payrollService.approvePayrollRun(id, approvedBy);
  }

  @Put('runs/:id/confirm-payment')
  confirmPayment(
    @Param('id') id: string,
    @Body() body: { bankId: string },
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    return this.payrollService.confirmPayment(id, body.bankId, tenantId);
  }

  @Put('entries/:id')
  updatePayrollEntry(
    @Param('id') id: string,
    @Body() body: { concepts: Array<{ name: string; type: string; amount: number; saved?: boolean }> },
  ) {
    return this.payrollService.updatePayrollEntry(id, body.concepts);
  }

  @Get('concepts/:employeeId')
  getConceptTemplates(
    @Param('employeeId') employeeId: string,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    return this.payrollService.getConceptTemplates(employeeId, tenantId);
  }

  @Post('concepts')
  saveConceptTemplate(
    @Body() body: { employeeId: string; name: string; type: string; defaultAmount: number; id?: string },
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    return this.payrollService.saveConceptTemplate(body, tenantId);
  }

  @Delete('concepts/:id')
  deleteConceptTemplate(@Param('id') id: string) {
    return this.payrollService.deleteConceptTemplate(id);
  }

  @Get('catalog')
  getCatalog(
    @Request() req: any,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-company-id') companyId?: string,
  ) {
    const tid = tenantId || req?.user?.tenantId;
    const cid = companyId || req?.user?.companyId;
    return this.payrollService.getCatalog(tid, cid);
  }

  @Post('catalog')
  saveCatalogConcept(
    @Body() body: any,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-company-id') companyId?: string,
    @Request() req?: any,
  ) {
    const tid = tenantId || req?.user?.tenantId;
    const cid = companyId || req?.user?.companyId;
    return this.payrollService.saveCatalogConcept({ ...body, tenantId: tid, companyId: cid });
  }

  @Delete('catalog/:id')
  deleteCatalogConcept(@Param('id') id: string) {
    return this.payrollService.deleteCatalogConcept(id);
  }

  @Get('period-locked')
  isPeriodLocked(
    @Query('branchId') branchId: string,
    @Query('date') date: string,
  ) {
    return this.payrollService.isPeriodLocked(branchId, date);
  }

  @Post('incapacities')
  createIncapacity(
    @Body() body: {
      employeeId: string;
      startDate: string;
      endDate: string;
      days: number;
      type: string;
      imssFileNumber?: string;
      diagnosis?: string;
      notes?: string;
    },
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    return this.payrollService.createIncapacity(body, tenantId);
  }

  @Get('incapacities/:employeeId')
  getIncapacities(
    @Param('employeeId') employeeId: string,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = headerTenantId || req?.user?.tenantId;
    return this.payrollService.getIncapacities(employeeId, tenantId);
  }
}
