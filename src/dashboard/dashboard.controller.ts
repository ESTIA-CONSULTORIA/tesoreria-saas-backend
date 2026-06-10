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
    @Headers('x-branch-id') headerBranchId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Headers('tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;
    const tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId
      || (await this.companiesRepo.findOne({ where: {} }))?.tenantId;
    
    let branchId = headerBranchId;
    let companyId = headerCompanyId;

    // If user has branchId in JWT, use it and ignore headers
    if (userBranchId) {
      branchId = userBranchId;
      companyId = undefined;
    }
    // If user has companyId but no branchId in JWT, use it and ignore X-Branch-Id header
    else if (userCompanyId) {
      companyId = userCompanyId;
      branchId = undefined;
    }
    
    return this.dashboardService.getKpis(period, branchId, companyId, tenantId);
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
