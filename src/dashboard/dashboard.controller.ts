import { Controller, Get, Query, Headers, Request, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { Repository } from 'typeorm';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private dashboardService: DashboardService,
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
  ) {}

  @Get('kpis')
  async getKpis(
    @Query('period') period?: string,
    @Headers('x-branch-id') branchId?: string,
    @Headers('x-company-id') companyId?: string,
    @Headers('tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId
      || (await this.companiesRepo.findOne({ where: {} }))?.tenantId;
    
    return this.dashboardService.getKpis(period, branchId, tenantId);
  }

  @Get('company/:companyId/kpis')
  async getCompanyKpis(
    @Param('companyId') companyId: string,
    @Query('period') period?: string,
    @Headers('tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId
      || (await this.companiesRepo.findOne({ where: {} }))?.tenantId;
    
    return this.dashboardService.getCompanyKpis(companyId, period, tenantId);
  }
}
