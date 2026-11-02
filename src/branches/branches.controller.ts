import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { tenantDeSesion, tenantParaListar } from '../auth/tenant-access.util';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  // Alta, edición y baja de sucursales: solo ADMIN, GERENTE y SOPORTE (antes cualquier usuario autenticado, incluido un cajero)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'SOPORTE')
  @Post()
  create(
    @Body()
    body: {
      companyId: string;
      code: string;
      name: string;
      address?: string;
      city?: string;
      state?: string;
    },
    @Request() req?: any,
  ) {
    // Auditoría de seguridad (GoodsHabits, hallazgo #2 BUSINESS): tenantId siempre del JWT,
    // mismo criterio que companies.controller.ts::create().
    const tenantId = tenantDeSesion(req);
    return this.branchesService.create(
      body.companyId,
      body.code,
      body.name,
      body.address,
      body.city,
      body.state,
      tenantId,
    );
  }

  @Get()
  findAll(
    @Query('companyId') queryCompanyId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const userCompanyId = req?.user?.companyId;
    // Tenant del token (403 si no es SOPORTE y no lo trae); SOPORTE con ?tenantId= explícito
    const tenantId = tenantParaListar(req, req?.query?.tenantId);

    // If user has companyId in JWT, use it and ignore everything else
    if (userCompanyId) {
      return this.branchesService.findByCompany(userCompanyId, tenantId);
    }

    // If query param companyId is present, use it
    if (queryCompanyId) {
      return this.branchesService.findByCompany(queryCompanyId, tenantId);
    }

    // If user has tenantId in JWT, filter by tenant
    if (tenantId) {
      return this.branchesService.findByTenant(tenantId);
    }

    // Otherwise, use header if present
    if (headerCompanyId) {
      return this.branchesService.findByCompany(headerCompanyId, tenantId);
    }

    // Sin tenant (SOPORTE sin ?tenantId= ni empresa) no se listan las sucursales de todos los negocios
    return [];
  }

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string, @Request() req?: any) {
    // Auditoría de seguridad (GoodsHabits, hallazgo #2 BUSINESS): sin esto, cualquier usuario
    // autenticado podía listar las sucursales de una empresa ajena solo sabiendo su companyId.
    const tenantId = tenantDeSesion(req);
    return this.branchesService.findByCompany(companyId, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'SOPORTE')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      companyId?: string;
      code?: string;
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      isActive?: boolean;
    },
    @Request() req?: any,
  ) {
    const tenantId = tenantDeSesion(req);
    return this.branchesService.update(id, body, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'SOPORTE')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.branchesService.remove(id, tenantId);
  }
}