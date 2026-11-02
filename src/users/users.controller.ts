import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { esSoporte, tenantDeSesion, tenantParaListar } from '../auth/tenant-access.util';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Gestión de usuarios: solo ADMIN, GERENTE y SOPORTE (antes cualquier usuario autenticado, incluido un cajero, podía
  // crear o ascender usuarios). Qué rol puede asignar cada uno lo valida UsersService.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'SOPORTE')
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
    // Tenant del token; el body.tenantId solo lo usa SOPORTE (que no tiene tenant propio). Un token sin tenant que no es SOPORTE: 403.
    const tenantId = esSoporte(req?.user) ? body.tenantId || undefined : tenantDeSesion(req);
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
      req?.user?.roleCode ?? 'NINGUNO',
    );
  }

  @Get()
  findAll(@Query('tenantId') queryTenantId?: string, @Request() req?: any) {
    // El ?tenantId= solo lo respeta SOPORTE (para elegir negocio; sin él ve todos). Para cualquier otro rol se ignora y manda el token;
    // un rol que no es SOPORTE y no trae tenant en el token no ve a nadie (antes un token sin tenant listaba a todos los tenants).
    if (esSoporte(req?.user)) return this.usersService.listarConNombres(queryTenantId || undefined);
    if (!req?.user?.tenantId) return [];
    return this.usersService.listarConNombres(req.user.tenantId);
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
    const tenantId = tenantParaListar(req, queryTenantId);
    if (!tenantId) return [];
    return this.usersService.findByRole(roleCode, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'SOPORTE')
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
      roleCode: req?.user?.roleCode ?? 'NINGUNO',
      companyId: req?.user?.companyId,
      tenantId: tenantDeSesion(req),
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
    const tenantId = tenantDeSesion(req);
    return this.usersService.updateCompany(id, body.companyId, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'SOPORTE')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.usersService.remove(id, tenantId, req?.user?.roleCode ?? 'NINGUNO');
  }
}
