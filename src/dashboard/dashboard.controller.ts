import { Controller, Get, Query, Headers, Request, Param, NotFoundException } from '@nestjs/common';
import { esSoporte, tenantDeSesion } from '../auth/tenant-access.util';
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
    // El tenant sale del token; el header solo vale para SOPORTE. Nunca se cae a "la primera empresa de la BD".
    const tenantId = tenantDeSesion(req) ?? headerTenantId;
    
    // La sucursal del usuario manda; el header (Switch Context) solo elige para quien no tiene sucursal, y debe ser del tenant.
    const efectiva = sucursalEfectiva(req?.user, headerBranchId);
    if (efectiva.branchId && !efectiva.restringida) await assertSucursalLegible(this.companiesRepo.manager, efectiva.branchId, tenantId);
    let branchId = efectiva.branchId || userBranchId || undefined;
    let companyId = headerCompanyId || userCompanyId || undefined;
    // El x-company-id (header) debe ser una empresa del tenant del token; si no, 404 (sin distinguir inexistente de ajena).
    if (companyId && tenantId) {
      const propia = await this.companiesRepo.findOne({ where: { id: companyId, tenantId } });
      if (!propia) throw new NotFoundException('Empresa no encontrada');
    }
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
    // El tenant sale del token y la empresa debe pertenecerle (404 si no existe o es de otro tenant, sin distinguirlas).
    // SOPORTE (sin tenant en el token) opera sobre el tenant de la propia empresa pedida.
    const tenantDelToken = tenantDeSesion(req);
    const empresa = await this.companiesRepo.findOne({ where: tenantDelToken ? { id: companyId, tenantId: tenantDelToken } : { id: companyId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    const tenantId = tenantDelToken ?? (esSoporte(req?.user) ? empresa.tenantId : undefined);

    return this.dashboardService.getCompanyKpis(companyId, period, tenantId);
  }
}
