import { Controller, Get, Post, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { ModulesService } from './modules.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('modules')
export class ModulesController {
  constructor(private service: ModulesService) {}

  @Get()
  getAllModules() {
    return this.service.getAllModules();
  }

  @Get('tenant/:tenantId')
  getTenantModules(@Param('tenantId') tenantId: string) {
    return this.service.getTenantModules(tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post('tenant/:tenantId/activate')
  activate(
    @Param('tenantId') tenantId: string,
    @Body() body: { moduleCode: string; source?: string; price?: number },
    @Request() req: any,
  ) {
    return this.service.activateModule(tenantId, body.moduleCode, body.source || 'manual_support', req.user?.email, body.price || 0);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Delete('tenant/:tenantId/:moduleCode')
  deactivate(@Param('tenantId') tenantId: string, @Param('moduleCode') moduleCode: string) {
    return this.service.deactivateModule(tenantId, moduleCode);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post('tenant/:tenantId/init')
  initFromPlan(@Param('tenantId') tenantId: string, @Body() body: { planCode: string }) {
    return this.service.initFromPlan(tenantId, body.planCode);
  }
}
