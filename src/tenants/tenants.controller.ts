import { Body, Controller, Get, Post, Put, Patch, Param, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GIROS, GIRO_LABELS } from '../config/giros.config';

@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  // Auditoría de producto (GoodsHabits, Hallazgo 3): catálogo estático para el selector de
  // giro del panel SOPORTE — no expone nada sensible, solo el código+etiqueta.
  @Get('giros')
  getGiros() {
    return GIROS.map((code) => ({ code, label: GIRO_LABELS[code] }));
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post()
  create(
    @Body()
    body: {
      legalName: string;
      tradeName?: string;
      taxId?: string;
      plan?: string;
      email?: string;
      password?: string;
      ownerName?: string;
      rfc?: string;
      industry?: string;
      giro?: string;
      phone?: string;
      city?: string;
      state?: string;
      slug?: string;
      billingCycle?: string;
    },
  ) {
    return this.tenantsService.create(body);
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Public()
  @Get('resolve/:slug')
  resolveBySlug(@Param('slug') slug: string) {
    return this.tenantsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  // Auditoría de producto/seguridad (GoodsHabits, Hallazgo 3): faltaba @Roles('SOPORTE')
  // aquí — cualquier usuario autenticado podía llamar este endpoint directo (sin pasar por
  // la UI) para editar legalName/tradeName/plan/isActive de CUALQUIER tenant. Confirmado
  // que solo GestionClientes.tsx (panel SOPORTE) lo consume hoy — no rompe ningún flujo
  // existente.
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { legalName?: string; tradeName?: string; plan?: string; isActive?: boolean; giro?: string },
  ) {
    return this.tenantsService.update(id, body);
  }

  @Put(':id/plan')
  updatePlan(@Param('id') id: string, @Body('plan') plan: string) {
    return this.tenantsService.updatePlan(id, plan);
  }

  @Patch(':id/onboard')
  markOnboarded(@Param('id') id: string) {
    return this.tenantsService.markOnboarded(id);
  }
}