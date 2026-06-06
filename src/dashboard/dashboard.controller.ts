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
    // Prioridad:
    // 1. tenantId del JWT del usuario
    // 2. tenant-id del header (enviado por el frontend)
    // 3. tenantId de la empresa seleccionada (X-Company-Id)
    
    let tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId;
    
    // Si aún no hay tenantId pero hay companyId,
    // buscar el tenant de esa empresa
    if (!tenantId && companyId) {
      const company = await this.companiesRepo.findOne({ where: { id: companyId } });
      tenantId = company?.tenantId;
    }
    
    // Fallback para demo: usar tenantId conocido
    if (!tenantId) {
      // Buscar cualquier tenant activo
      const anyCompany = await this.companiesRepo.findOne({ where: {} });
      tenantId = anyCompany?.tenantId;
    }
    
    return this.dashboardService.getKpis(period, branchId, tenantId);
  }

  @Get('company/:companyId/kpis')
  async getCompanyKpis(
    @Param('companyId') companyId: string,
    @Query('period') period?: string,
    @Headers('tenant-id') headerTenantId?: string,
    @Request() req?: any,
  ) {
    // Prioridad:
    // 1. tenantId del JWT del usuario
    // 2. tenant-id del header (enviado por el frontend)
    // 3. tenantId de la empresa seleccionada
    
    let tenantId = req?.user?.tenantId 
      || req?.tenantId 
      || headerTenantId;
    
    // Si aún no hay tenantId, buscar el tenant de la empresa
    if (!tenantId) {
      const company = await this.companiesRepo.findOne({ where: { id: companyId } });
      tenantId = company?.tenantId;
    }
    
    // Fallback para demo: usar tenantId conocido
    if (!tenantId) {
      const anyCompany = await this.companiesRepo.findOne({ where: {} });
      tenantId = anyCompany?.tenantId;
    }
    
    return this.dashboardService.getCompanyKpis(companyId, period, tenantId);
  }
}
