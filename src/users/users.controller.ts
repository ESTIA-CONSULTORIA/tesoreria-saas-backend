import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../auth/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  create(
    @Body()
    body: {
      email: string;
      password: string;
      name?: string;
      roleId?: string;
      roleCode?: string;
      tenantId?: string;
      companyId?: string;
      branchId?: string;
      executivePin?: string;
    },
    @Request() req?: any,
  ) {
    // Auditoría de seguridad (GoodsHabits): el body es controlable por el cliente — antes
    // se evaluaba ANTES que el JWT, así que un ADMIN de Tenant A podía crear un usuario en
    // Tenant B mandando tenantId/companyId/branchId a mano en el body (el frontend nunca lo
    // hace, pero el endpoint lo aceptaba). El JWT va primero, igual que ya hacía GET /users
    // en este mismo archivo; el body queda como fallback solo para SOPORTE (sin tenantId
    // propio) creando un usuario en un tenant específico.
    const tenantId = req?.user?.tenantId || body.tenantId;
    const companyId = req?.user?.companyId || body.companyId;
    const branchId = req?.user?.branchId || body.branchId;
    return this.usersService.create(
      body.email,
      body.password,
      body.name,
      body.roleId,
      body.roleCode,
      tenantId,
      companyId,
      branchId,
      body.executivePin,
    );
  }

  @Get()
  findAll(@Query('tenantId') queryTenantId?: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId || queryTenantId;
    return this.usersService.findAll(tenantId);
  }

  @Get('email/:email')
  @Public()
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('role/:roleCode')
  findByRole(@Param('roleCode') roleCode: string, @Query('tenantId') tenantId?: string) {
    return this.usersService.findByRole(roleCode, tenantId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      roleId?: string;
      roleCode?: string;
      isActive?: boolean;
      executivePin?: string;
    },
  ) {
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
