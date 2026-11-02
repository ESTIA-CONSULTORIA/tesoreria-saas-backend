import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CompaniesService } from './companies.service';
import { Public } from '../auth/public.decorator';
import { esSoporte, tenantDeSesion } from '../auth/tenant-access.util';

@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  // Alta, edición y baja de empresas: solo ADMIN y SOPORTE (antes cualquier usuario autenticado, incluido un cajero)
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Post()
  create(
    @Body()
    body: {
      tenantId: string;
      legalName: string;
      tradeName: string;
      taxId?: string;
      baseCurrency?: string;
    },
    @Request() req?: any,
  ) {
    // Auditoría de seguridad (GoodsHabits, hallazgo #2 BUSINESS): antes se confiaba en el
    // tenantId del body sin cruzarlo contra el JWT — cualquier ADMIN autenticado podía crear
    // una empresa dentro de OTRO tenant con solo mandarlo en el body. El JWT va primero; el
    // body queda como fallback solo para SOPORTE (sin tenantId propio) dando de alta una
    // empresa en un tenant específico — mismo criterio que users.controller.ts::create().
    // Tenant del token; el body.tenantId solo lo usa SOPORTE (sin tenant propio). Un token sin tenant que no es SOPORTE: 403.
    const tenantId = (esSoporte(req?.user) ? body.tenantId : tenantDeSesion(req)) as string;
    return this.companiesService.create(
      tenantId,
      body.legalName,
      body.tradeName,
      body.taxId,
      body.baseCurrency,
    );
  }

  @Get()
  findAll(@Request() req) {
    // Solo SOPORTE ve todas las empresas; cualquier otro rol ve las de su tenant (sin tenant en el token: 403).
    const tenantId = tenantDeSesion(req);
    if (tenantId) {
      return this.companiesService.findByTenant(tenantId);
    }
    // SOPORTE: lista global de la plataforma, acotable con ?tenantId=
    if (req?.query?.tenantId) return this.companiesService.findByTenant(String(req.query.tenantId));
    return this.companiesService.findAll();
  }

  // Auditoría de seguridad (GoodsHabits, hallazgo #2 BUSINESS): @Public() confirmado como
  // intencional, no un descuido — lo consume CorteCajaLite.tsx (plan LITE_CORTE,
  // frontend-core/src/pages/lite/CorteCajaLite.tsx) para resolver qué empresas existen bajo
  // un tenantId ANTES de cualquier login, en el flujo de kiosko sin sesión de ese plan. Solo
  // expone legalName/tradeName/taxId/isActive — nada financiero ni de usuarios — así que se
  // deja público a propósito; si se quisiera cerrar, ese flujo de kiosko se rompe.
  @Public()
  @Get('tenant/:tenantId')
  async findByTenant(@Param('tenantId') tenantId: string) {
    // Endpoint PÚBLICO (el kiosko lo llama antes de iniciar sesión): solo datos NO sensibles de las empresas activas.
    // Antes devolvía la fila completa (RFC/taxId, razón social, moneda, tenantId...) de cualquier tenant.
    const empresas = await this.companiesService.findByTenant(tenantId);
    return empresas
      .filter((c) => c.isActive !== false)
      .map((c) => ({ id: c.id, tradeName: c.tradeName, legalName: c.legalName }));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.companiesService.findOne(id, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      legalName?: string;
      tradeName?: string;
      taxId?: string;
      baseCurrency?: string;
      isActive?: boolean;
    },
    @Request() req?: any,
  ) {
    const tenantId = tenantDeSesion(req);
    return this.companiesService.update(id, body, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.companiesService.remove(id, tenantId);
  }
}