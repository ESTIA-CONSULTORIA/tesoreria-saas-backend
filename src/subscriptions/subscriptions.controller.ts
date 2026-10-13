import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { assertTenantAccess } from '../auth/tenant-access.util';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionAlertsService } from './subscription-alerts.service';
import { Subscription } from './entities/subscription.entity';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private subsService: SubscriptionsService,
    private alertsService: SubscriptionAlertsService,
  ) {}

  // Crear/cambiar plan/renovar la suscripción de un tenant es dinero: solo SOPORTE.
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post()
  create(@Body() body: Partial<Subscription>) {
    return this.subsService.create(body);
  }

  @Get('tenant/:tenantId')
  findByTenant(@Param('tenantId') tenantId: string, @Request() req?: any) {
    assertTenantAccess(req?.user, tenantId, 'No tienes permiso para consultar la suscripción de otro tenant');
    return this.subsService.findByTenant(tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Put(':tenantId/plan')
  updatePlan(@Param('tenantId') tenantId: string, @Body('planCode') planCode: string) {
    return this.subsService.updatePlan(tenantId, planCode);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post(':tenantId/renew')
  renew(@Param('tenantId') tenantId: string) {
    return this.subsService.renewSubscription(tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Get('alerts')
  getAlerts() {
    return this.alertsService.getAlerts();
  }
}