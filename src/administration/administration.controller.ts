import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { AdministrationService } from './administration.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DeliveryIngestService } from '../integrations/delivery/delivery-ingest.service';

// Auditoría de seguridad (GoodsHabits, pre-venta): este controller no tenía NINGÚN guard
// de rol — cualquier ADMIN/GERENTE autenticado de cualquier tenant con suscripción activa
// pasaba SubscriptionGuard/PlanModuloGuard (ninguno de los dos exige un rol) y podía listar
// todos los tenants, cambiar el plan de otro tenant, ver sesiones activas de toda la
// plataforma, y modificar config global. A nivel de clase (no por método) para que no quede
// a criterio de quien agregue el próximo endpoint aquí — RolesGuard/@Roles no son guards
// globales (no están en app.module.ts), hay que aplicarlos explícitamente, igual que ya
// hace tenants.controller.ts en su POST.
@UseGuards(RolesGuard)
@Roles('SOPORTE')
@Controller('administration')
export class AdministrationController {
  constructor(
    private administrationService: AdministrationService,
    private deliveryIngestService: DeliveryIngestService,
  ) {}

  @Get('audit-logs')
  getAuditLogs(
    @Query('userId') userId?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.administrationService.getAuditLogs({
      userId,
      entity,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Post('audit-logs')
  createAuditLog(@Body() data: {
    userId: string;
    userEmail: string;
    roleCode?: string;
    tenantId: string;
    action: string;
    entity: string;
    details?: any;
    ipAddress: string;
    userAgent: string;
  }) {
    return this.administrationService.createAuditLog(data);
  }

  @Get('tenants')
  getTenants() {
    return this.administrationService.getTenants();
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.administrationService.getTenant(id);
  }

  @Put('tenants/:id')
  updateTenant(
    @Param('id') id: string,
    @Body() data: { legalName?: string; tradeName?: string; isActive?: boolean },
  ) {
    return this.administrationService.updateTenant(id, data);
  }

  @Put('tenants/:id/plan')
  updateTenantPlan(
    @Param('id') id: string,
    @Body() data: { plan: string },
  ) {
    return this.administrationService.updateTenantPlan(id, data.plan);
  }

  @Get('sessions')
  getActiveSessions() {
    return this.administrationService.getActiveSessions();
  }

  @Get('config')
  getSystemConfig() {
    return this.administrationService.getSystemConfig();
  }

  @Put('config')
  updateSystemConfig(@Body() data: {
    maintenanceMode?: boolean;
    maxUsersPerTenant?: number;
    defaultRole?: string;
    sessionTimeout?: number;
    allowedOrigins?: string[];
  }) {
    return this.administrationService.updateSystemConfig(data);
  }

  @Get('global-config')
  getGlobalConfig() {
    return this.administrationService.getGlobalConfig();
  }

  @Put('global-config')
  updateGlobalConfig(@Body() data: {
    nombreSistema?: string;
    zonaHoraria?: string;
    monedaDefault?: string;
    formatoFecha?: string;
    limiteSessiones?: number;
  }) {
    return this.administrationService.updateGlobalConfig(data);
  }

  // Pedidos de Delivery en cuarentena — tenants que mandaron pedidos reales sin tener el
  // addon 'delivery' activo (ver delivery-ingest.service.ts::quarantine()).
  @Get('delivery-quarantine')
  getDeliveryQuarantine(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
  ) {
    return this.deliveryIngestService.listQuarantine(tenantId, status);
  }

  @Post('delivery-quarantine/:id/resolve')
  resolveDeliveryQuarantine(
    @Param('id') id: string,
    @Body() body: { action: 'activate' | 'reject' },
    @Request() req: any,
  ) {
    // resolvedBy sale de la sesión SOPORTE autenticada, no del body — evita que quede
    // registrado un nombre distinto al de quien realmente ejecutó la acción.
    const resolvedBy = req?.user?.email || req?.user?.id || 'soporte';
    return this.deliveryIngestService.resolveQuarantine(id, body.action, resolvedBy);
  }
}
