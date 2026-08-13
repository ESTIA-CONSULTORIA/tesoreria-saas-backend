import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ExecutiveConfigService } from './executive-config.service';
import { ExecutiveAccessGuard } from './executive-access.guard';

@UseGuards(ExecutiveAccessGuard)
@Controller('executive-config')
export class ExecutiveConfigController {
  constructor(private service: ExecutiveConfigService) {}

  @Get()
  findMine(@Request() req: any) {
    return this.service.findByTenant(req.user.tenantId);
  }

  @Put()
  update(@Request() req: any, @Body() body: { theme?: string; modules?: Record<string, boolean> }) {
    return this.service.upsert(req.user.tenantId, body);
  }
}
