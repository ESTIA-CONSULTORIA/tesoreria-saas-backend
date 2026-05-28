import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdministrationService } from './administration.service';
import { AuditAction, AuditModule } from './entities/audit-log.entity';

@Controller('administration')
export class AdministrationController {
  constructor(private administrationService: AdministrationService) {}

  @Get('audit-logs')
  getAuditLogs(
    @Query('userId') userId?: string,
    @Query('module') module?: AuditModule,
    @Query('action') action?: AuditAction,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.administrationService.getAuditLogs({
      userId,
      module,
      action,
      startDate,
      endDate,
    });
  }

  @Post('audit-logs')
  createAuditLog(@Body() data: {
    userId: string;
    userName?: string;
    userEmail?: string;
    action: AuditAction;
    module: AuditModule;
    entityId?: string;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
    userAgent?: string;
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
}
