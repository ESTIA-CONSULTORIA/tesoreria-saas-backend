import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';
import { Public } from '../auth/public.decorator';

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private service: TenantSettingsService) {}

  @Public()
  @Get('defaults')
  getDefaults() {
    return this.service.getDefaults();
  }

  @Public()
  @Get(':tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.service.findByTenant(tenantId);
  }

  @Put(':tenantId')
  update(@Param('tenantId') tenantId: string, @Body() body: any) {
    return this.service.upsert(tenantId, body);
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
