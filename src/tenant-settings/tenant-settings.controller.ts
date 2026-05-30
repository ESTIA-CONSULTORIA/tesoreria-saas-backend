import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private service: TenantSettingsService) {}

  @Get(':tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.service.findByTenant(tenantId);
  }

  @Get('defaults')
  getDefaults() {
    return this.service.getDefaults();
  }

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
    },
  ) {
    return this.service.upsert(tenantId, body);
  }
}
