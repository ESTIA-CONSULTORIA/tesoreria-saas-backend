import { Controller, Get, Query, Headers, Request, Param } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { Repository } from 'typeorm';
import { assertSucursalLegible, sucursalEfectiva } from '../common/sucursal-efectiva';

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
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;
    const tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId
      || (await this.companiesRepo.findOne({ where: {} }))?.tenantId;
    
    // La sucursal del usuario manda; el header (Switch Context) solo elige para quien no tiene sucursal, y debe ser del tenant.
    const efectiva = sucursalEfectiva(req?.user, headerBranchId);
    if (efectiva.branchId && !efectiva.restringida) await assertSucursalLegible(this.companiesRepo.manager, efectiva.branchId, tenantId);
    let branchId = efectiva.branchId || userBranchId || undefined;
    let companyId = headerCompanyId || userCompanyId || undefined;
    // Branch is more specific than company — don't double-filter
    if (branchId) companyId = undefined;
    
    return this.dashboardService.getKpis(period, branchId, companyId, tenantId);
  }

  @Get('company/:companyId/kpis')
  async getCompanyKpis(
    @Param('companyId') companyId: string,
    @Query('period') period?: string,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId
      || (await this.companiesRepo.findOne({ where: {} }))?.tenantId;
    
    return this.dashboardService.getCompanyKpis(companyId, period, tenantId);
  }
}
