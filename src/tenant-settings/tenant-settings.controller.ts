import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private service: TenantSettingsService) {}

  @Public()
  @Get('defaults')
  getDefaults() {
    return this.service.getDefaults();
  }

  // Auditoría de seguridad (GoodsHabits, hallazgo #3 BUSINESS): @Public() confirmado como
  // intencional, no un descuido — lo consumen varias pantallas SIN sesión para pintar el
  // branding del tenant antes de login: App.tsx (tema global al montar la app),
  // ExecutiveLogin.tsx (Vista Ejecutiva, vía execPublicApi sin token) y
  // useLoginConfigStore.ts. Solo expone colores/logo/tipografía — nada financiero ni de
  // usuarios — así que cerrarlo rompería esas pantallas de login sin ganar mucho a cambio.
  @Public()
  @Get(':tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.service.findByTenant(tenantId);
  }

  // Auditoría de seguridad (GoodsHabits, hallazgo #3 BUSINESS): antes no tenía NINGÚN guard —
  // cualquier usuario autenticado de cualquier tenant, incluso un CAJERO, podía sobrescribir
  // el branding y el stockPolicy (regla de negocio de inventario) de OTRO tenant con solo
  // conocer su UUID. Ahora exige que :tenantId sea el propio del usuario (SOPORTE, sin
  // tenantId en su JWT, conserva acceso total — mismo criterio que hallazgos #1/#2) y al
  // menos rol ADMIN dentro del propio tenant.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Put(':tenantId')
  update(@Param('tenantId') tenantId: string, @Body() body: any, @Request() req?: any) {
    this.assertOwnTenant(tenantId, req);
    return this.service.upsert(tenantId, body);
  }

  // Mismo hueco que PUT — este endpoint llama exactamente al mismo this.service.upsert(), así
  // que necesita el mismo guard aunque el hallazgo original solo mencionaba el verbo PUT.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Post(':tenantId')
  upsert(
    @Param('tenantId') tenantId: string,
    @Body()
    body: {
      name?: string;
      logoUrl?: string;
      faviconUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      fontFamily?: string;
      fontSize?: number;
      sidebarColor?: string;
      sidebarTextColor?: string;
      sidebarActiveColor?: string;
      sidebarStyle?: 'compact' | 'normal' | 'expanded';
      primaryButtonColor?: string;
      secondaryButtonColor?: string;
      buttonBorderRadius?: 'square' | 'rounded' | 'pill';
      stockPolicy?: 'BLOQUEAR' | 'PERMITIR_NEGATIVO';
    },
    @Request() req?: any,
  ) {
    this.assertOwnTenant(tenantId, req);
    return this.service.upsert(tenantId, body);
  }

  // GET /tenant-settings/:tenantId ya es público (y expone poco), así que no hay necesidad de
  // ocultar si un tenantId existe u otro — un 403 explícito es más claro para el frontend que
  // disfrazarlo de "no encontrado".
  private assertOwnTenant(tenantId: string, req?: any) {
    const userTenantId = req?.user?.tenantId;
    if (userTenantId && userTenantId !== tenantId) {
      throw new ForbiddenException('No puedes modificar la configuración de otro tenant');
    }
  }
}
