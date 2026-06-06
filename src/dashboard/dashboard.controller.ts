import { Controller, Get, Query, Headers, Request, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CompaniesService } from '../companies/companies.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private dashboardService: DashboardService,
    private companiesService: CompaniesService,
  ) {}

  @Get('kpis')
  async getKpis(
    @Query('period') period?: string,
    @Headers('x-branch-id') branchId?: string,
    @Headers('x-company-id') companyId?: string,
    @Request() req?: any,
  ) {
    let tenantId = req?.user?.tenantId || req?.tenantId;
    
    // Si SOPORTE sin tenantId, intentar obtener tenantId desde la empresa seleccionada
    if (!tenantId && companyId) {
      const company = await this.companiesService.findOne(companyId);
      tenantId = company?.tenantId;
    }
    
    // Si aún no hay tenantId, usar el del primer tenant de demostración
    if (!tenantId) {
      tenantId = '59df42f9-6738-4994-9488-e34c7df6ec9d';
    }
    
    return this.dashboardService.getKpis(period, branchId, tenantId);
  }

  @Get('company/:companyId/kpis')
  async getCompanyKpis(
    @Param('companyId') companyId: string,
    @Query('period') period?: string,
    @Request() req?: any,
  ) {
    let tenantId = req?.user?.tenantId || req?.tenantId;
    
    // Si SOPORTE sin tenantId, intentar obtener tenantId desde la empresa
    if (!tenantId) {
      const company = await this.companiesService.findOne(companyId);
      tenantId = company?.tenantId;
    }
    
    // Si aún no hay tenantId, usar el del primer tenant de demostración
    if (!tenantId) {
      tenantId = '59df42f9-6738-4994-9488-e34c7df6ec9d';
    }
    
    return this.dashboardService.getCompanyKpis(companyId, period, tenantId);
  }
}
