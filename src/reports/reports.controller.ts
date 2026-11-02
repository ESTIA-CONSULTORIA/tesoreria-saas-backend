import { Controller, Get, Query, Request, Headers } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Modulo } from '../auth/modulo.decorator';
import { tenantParaListar } from '../auth/tenant-access.util';

@Controller('reports')
@Modulo('reportes')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('cash-flow')
  cashFlow(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Headers('x-company-id') headerCompanyId?: string,
  ) {
    const user = req.user;
    const tenantId = tenantParaListar(req, req?.query?.tenantId); // token; SOPORTE con ?tenantId= explícito; sin tenant 403
    const companyId = headerCompanyId || user?.companyId;
    return this.reportsService.cashFlow(startDate, endDate, tenantId, companyId);
  }

  @Get('balance-by-account')
  balanceByAccount(
    @Request() req,
    @Headers('x-company-id') headerCompanyId?: string,
  ) {
    const user = req.user;
    const tenantId = tenantParaListar(req, req?.query?.tenantId); // token; SOPORTE con ?tenantId= explícito; sin tenant 403
    const companyId = headerCompanyId || user?.companyId;
    return this.reportsService.balanceByAccount(tenantId, companyId);
  }

  @Get('category-summary')
  categorySummary(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Headers('x-company-id') headerCompanyId?: string,
  ) {
    const user = req.user;
    const tenantId = tenantParaListar(req, req?.query?.tenantId); // token; SOPORTE con ?tenantId= explícito; sin tenant 403
    const companyId = headerCompanyId || user?.companyId;
    return this.reportsService.categorySummary(startDate, endDate, tenantId, companyId);
  }

  @Get('income-statement')
  incomeStatement(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Headers('x-company-id') headerCompanyId?: string,
  ) {
    const user = req.user;
    const tenantId = tenantParaListar(req, req?.query?.tenantId); // token; SOPORTE con ?tenantId= explícito; sin tenant 403
    const companyId = headerCompanyId || user?.companyId;
    return this.reportsService.incomeStatement(startDate, endDate, tenantId, companyId);
  }

  @Get('break-even-point')
  breakEvenPoint(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Headers('x-company-id') headerCompanyId?: string,
  ) {
    const user = req.user;
    const tenantId = tenantParaListar(req, req?.query?.tenantId); // token; SOPORTE con ?tenantId= explícito; sin tenant 403
    const companyId = headerCompanyId || user?.companyId;
    return this.reportsService.breakEvenPoint(startDate, endDate, tenantId, companyId);
  }
}
