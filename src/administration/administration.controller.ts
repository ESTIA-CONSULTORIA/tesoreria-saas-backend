import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdministrationService } from './administration.service';

@Controller('administration')
export class AdministrationController {
  constructor(private administrationService: AdministrationService) {}

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
}
