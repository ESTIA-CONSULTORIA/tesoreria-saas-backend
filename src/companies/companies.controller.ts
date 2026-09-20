import { Body, Controller, Delete, Get, Param, Patch, Post, Request } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Public } from '../auth/public.decorator';

@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

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
    const tenantId = req?.user?.tenantId || body.tenantId;
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
    const tenantId = req.user?.tenantId || req.tenantId;
    if (tenantId) {
      return this.companiesService.findByTenant(tenantId);
    }
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
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.companiesService.findByTenant(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.companiesService.findOne(id, tenantId);
  }

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
    const tenantId = req?.user?.tenantId;
    return this.companiesService.update(id, body, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.companiesService.remove(id, tenantId);
  }
}