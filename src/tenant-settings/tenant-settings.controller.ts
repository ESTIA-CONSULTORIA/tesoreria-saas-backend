import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private service: TenantSettingsService) {}

  @Get(':tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.service.findByTenant(tenantId);
  }

  @Post(':tenantId')
  upsert(
    @Param('tenantId') tenantId: string,
    @Body()
    body: {
      name?: string;
      logoUrl?: string;
      primaryColor?: string;
      sidebarColor?: string;
    },
  ) {
    return this.service.upsert(tenantId, body);
  }
}
