import { Body, Controller, Get, Post, Put, Patch, Param, Request, UseGuards } from '@nestjs/common';
import { assertTenantAccess, esSoporte } from '../auth/tenant-access.util';
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

  // Solo SOPORTE ve todos los tenants; cualquier otro rol recibe únicamente el de su token.
  @Get()
  async findAll(@Request() req?: any) {
    if (esSoporte(req?.user)) return this.tenantsService.findAll();
    const tenantId = req?.user?.tenantId;
    if (!tenantId) return [];
    const propio = await this.tenantsService.findOne(tenantId);
    return propio ? [propio] : [];
  }

  // Auditoría de seguridad (Hallazgo 1c, GoodsHabits): este endpoint es público (lo usan
  // LoginPage.tsx / CorteCajaLite.tsx / ExecutiveLogin.tsx para resolver un slug antes de
  // tener sesión) y devolvía el registro COMPLETO del tenant — rfc, taxId, phone,
  // billingCycle, plan — a cualquiera que conociera o adivinara el nombre/slug. Se limita
  // el shape a lo que los 3 consumidores realmente usan: id (para armar el login) y
  // legalName/tradeName (solo para mostrar el nombre de la empresa en pantalla). Nada
  // fiscal ni de facturación sale de aquí. El entity no tiene un campo "tenantId" separado
  // de "id" — el propio id ES el tenantId.
  @Public()
  @Get('resolve/:slug')
  async resolveBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) return null;
    const { id, legalName, tradeName } = tenant;
    return { id, legalName, tradeName };
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req?: any) {
    assertTenantAccess(req?.user, id, 'No tienes permiso para consultar otro tenant');
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

  // El plan define lo que se cobra y qué módulos se ven: solo SOPORTE. (El panel SOPORTE usa
  // /administration/tenants/:id/plan; este endpoint no tiene consumidor de ADMIN.)
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Put(':id/plan')
  updatePlan(@Param('id') id: string, @Body('plan') plan: string) {
    return this.tenantsService.updatePlan(id, plan);
  }

  // OnboardingWizard (ADMIN o GERENTE) marca su propio tenant; SOPORTE puede marcar cualquiera.
  @UseGuards(RolesGuard)
  @Roles('SOPORTE', 'ADMIN', 'GERENTE')
  @Patch(':id/onboard')
  markOnboarded(@Param('id') id: string, @Request() req?: any) {
    assertTenantAccess(req?.user, id, 'No puedes modificar otro tenant');
    return this.tenantsService.markOnboarded(id);
  }
}