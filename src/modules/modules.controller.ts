import { Controller, Get, Post, Delete, Param, Body, Request } from '@nestjs/common';
import { ModulesService } from './modules.service';

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

  @Post('tenant/:tenantId/activate')
  activate(
    @Param('tenantId') tenantId: string,
    @Body() body: { moduleCode: string; source?: string; price?: number },
    @Request() req: any,
  ) {
    return this.service.activateModule(tenantId, body.moduleCode, body.source || 'manual_support', req.user?.email, body.price || 0);
  }

  @Delete('tenant/:tenantId/:moduleCode')
  deactivate(@Param('tenantId') tenantId: string, @Param('moduleCode') moduleCode: string) {
    return this.service.deactivateModule(tenantId, moduleCode);
  }
}
