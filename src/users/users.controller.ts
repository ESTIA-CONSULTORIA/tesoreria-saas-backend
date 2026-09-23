import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

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

  // Auditoría de seguridad (GoodsHabits, hallazgo #0 BUSINESS): existía como
  // GET /users/email/:email, @Public() — devolvía crudo el resultado de
  // UsersService.findByEmail(), que a propósito reincluye el hash de password (vía
  // .addSelect(['user.password']), ver ese método) porque auth.service.ts lo necesita para
  // bcrypt.compare() en el login. Cualquiera en internet, sin autenticarse, podía pedir el
  // hash bcrypt de la contraseña de cualquier cuenta con solo conocer su email. Sin
  // consumidor real (grep limpio en frontend-core y deliveryhub-pro) — se elimina el
  // endpoint. UsersService.findByEmail() NO se toca: auth.service.ts lo sigue usando para
  // login/register/portal-login.

  @Get('role/:roleCode')
  findByRole(
    @Param('roleCode') roleCode: string,
    @Query('tenantId') queryTenantId?: string,
    @Request() req?: any,
  ) {
    // Auditoría de seguridad (GoodsHabits, hallazgo transversal #6): tomaba el tenantId
    // directo del query param — un ADMIN de un tenant podía listar los usuarios de un rol
    // dado de OTRO tenant con solo mandar ?tenantId=<otro>. JWT primero, mismo criterio que
    // findAll() en este mismo archivo.
    const tenantId = req?.user?.tenantId || queryTenantId;
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
      branchId?: string;
    },
    @Request() req?: any,
  ) {
    // Hallazgo de producto (GoodsHabits): un ADMIN normal nunca elige empresa a mano, ni
    // al crear (ya heredaba req.user.companyId arriba) ni al editar — el selector de
    // Empresa es SOPORTE-only. Pero eso dejaba sin forma de completar companyId a
    // usuarios viejos que nunca lo tuvieron (el cajero de Bocatta, por ejemplo) sin pasar
    // por SOPORTE. usersService.update() rellena companyId automáticamente en ese caso
    // específico — ver el método, la lógica completa vive ahí, no acá.
    return this.usersService.update(id, body, {
      roleCode: req?.user?.roleCode,
      companyId: req?.user?.companyId,
      tenantId: req?.user?.tenantId,
    });
  }

  // Endpoint separado y SOPORTE-only a propósito, no un campo más en PUT /users/:id —
  // reasignar la empresa de un usuario es un caso de corrección de datos, no una edición
  // normal de perfil (puede dejar huérfanos registros que ya referencian la empresa
  // anterior — turnos de POS, ventas, alertas de insumo). RolesGuard/@Roles no son guards
  // globales, hay que aplicarlos explícitamente (mismo patrón que administration.controller.ts).
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Put(':id/company')
  updateCompany(
    @Param('id') id: string,
    @Body() body: { companyId: string },
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    return this.usersService.updateCompany(id, body.companyId, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.usersService.remove(id, tenantId);
  }
}
