import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ExecutiveConfigService } from './executive-config.service';
import { ExecutiveAccessGuard } from './executive-access.guard';
import { tenantParaEscribir } from '../auth/tenant-access.util';

@UseGuards(ExecutiveAccessGuard)
@Controller('executive-config')
export class ExecutiveConfigController {
  constructor(private service: ExecutiveConfigService) {}

  @Get()
  findMine(@Request() req: any) {
    return this.service.findByTenant(tenantParaEscribir(req, req?.query?.tenantId)); // tenant del token (SOPORTE con ?tenantId=)
  }

  @Put()
  update(@Request() req: any, @Body() body: { theme?: string; modules?: Record<string, boolean> }) {
    return this.service.upsert(tenantParaEscribir(req, req?.query?.tenantId), body);
  }
}
