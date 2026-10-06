import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { POLITICA_KEYS } from '../config/politicas-pos.config';
import { TenantSettingsService } from './tenant-settings.service';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PosCapability } from '../config/pos-capabilities.config';

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
  async findByTenant(@Param('tenantId') tenantId: string) {
    const setting = await this.service.findByTenant(tenantId);
    // Este GET es público: las políticas (devoluciones, cobro, división de cuentas) son reglas internas del
    // negocio y solo se leen por GET :tenantId/politica-* (ADMIN) o por los endpoints informativos del POS.
    if (setting?.posCapabilities && POLITICA_KEYS.some((k) => k in setting.posCapabilities!)) {
      const resto: Record<string, boolean | string> = { ...setting.posCapabilities } as Record<string, boolean | string>;
      for (const k of POLITICA_KEYS) delete resto[k];
      return { ...setting, posCapabilities: resto };
    }
    return setting;
  }

  // Política de devoluciones (SOLO_GERENTE | CAJERO_LIBRE), de cobro y de división de cuentas. Leer y cambiar: solo ADMIN del propio
  // tenant (SOPORTE conserva su acceso total, como en el resto de este controller). Un valor
  // inválido responde 400 desde el servicio.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Get(':tenantId/politica-devoluciones')
  async getPoliticaDevoluciones(@Param('tenantId') tenantId: string, @Request() req?: any) {
    this.assertOwnTenant(tenantId, req);
    return { politicaDevoluciones: await this.service.getPoliticaDevoluciones(tenantId) };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Put(':tenantId/politica-devoluciones')
  async setPoliticaDevoluciones(
    @Param('tenantId') tenantId: string,
    @Body() body: { politicaDevoluciones?: string },
    @Request() req?: any,
  ) {
    this.assertOwnTenant(tenantId, req);
    if (body?.politicaDevoluciones === undefined) {
      throw new BadRequestException('politicaDevoluciones es requerida.');
    }
    await this.service.upsert(tenantId, { politicaDevoluciones: body.politicaDevoluciones });
    return { politicaDevoluciones: await this.service.getPoliticaDevoluciones(tenantId) };
  }

  // Quién cobra una cuenta de mesa y desde dónde (SOLO_CAJA | GERENTE_EN_MESA | MESERO_EN_MESA). Solo ADMIN.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Get(':tenantId/politica-cobro')
  async getPoliticaCobro(@Param('tenantId') tenantId: string, @Request() req?: any) {
    this.assertOwnTenant(tenantId, req);
    return { politicaCobro: await this.service.getPoliticaCobro(tenantId) };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Put(':tenantId/politica-cobro')
  async setPoliticaCobro(@Param('tenantId') tenantId: string, @Body() body: { politicaCobro?: string }, @Request() req?: any) {
    this.assertOwnTenant(tenantId, req);
    if (body?.politicaCobro === undefined) {
      throw new BadRequestException('politicaCobro es requerida.');
    }
    await this.service.upsert(tenantId, { politicaCobro: body.politicaCobro });
    return { politicaCobro: await this.service.getPoliticaCobro(tenantId) };
  }

  // Quién puede dividir el cobro de una cuenta (GERENTE_CAPITAN_CAJERO | SOLO_GERENTE | TODOS). Solo ADMIN.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Get(':tenantId/politica-division-cuentas')
  async getPoliticaDivisionCuentas(@Param('tenantId') tenantId: string, @Request() req?: any) {
    this.assertOwnTenant(tenantId, req);
    return { politicaDivisionCuentas: await this.service.getPoliticaDivisionCuentas(tenantId) };
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Put(':tenantId/politica-division-cuentas')
  async setPoliticaDivisionCuentas(
    @Param('tenantId') tenantId: string,
    @Body() body: { politicaDivisionCuentas?: string },
    @Request() req?: any,
  ) {
    this.assertOwnTenant(tenantId, req);
    if (body?.politicaDivisionCuentas === undefined) {
      throw new BadRequestException('politicaDivisionCuentas es requerida.');
    }
    await this.service.upsert(tenantId, { politicaDivisionCuentas: body.politicaDivisionCuentas });
    return { politicaDivisionCuentas: await this.service.getPoliticaDivisionCuentas(tenantId) };
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
      posCapabilities?: Partial<Record<PosCapability, boolean>>;
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
