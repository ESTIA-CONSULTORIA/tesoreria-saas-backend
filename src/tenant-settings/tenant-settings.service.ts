import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantSetting } from './entities/tenant-setting.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TenantSettingsService {
  constructor(
    @InjectRepository(TenantSetting)
    private repo: Repository<TenantSetting>,
  ) {}

  findByTenant(tenantId: string) {
    return this.repo.findOne({ where: { tenantId } });
  }

  async upsert(
    tenantId: string,
    body: {
      name?: string;
      logoUrl?: string;
      faviconUrl?: string;
      backgroundImage?: string;
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
      customCSS?: string;
      splashBg?: string;
      theme?: string;
      companyDisplayName?: string;
    },
  ) {
    const existing = await this.findByTenant(tenantId);
    if (!existing) {
      const created = this.repo.create({
        tenantId,
        name: body.name,
        logoUrl: body.logoUrl,
        faviconUrl: body.faviconUrl,
        backgroundImage: body.backgroundImage,
        primaryColor: body.primaryColor || '#2563eb',
        secondaryColor: body.secondaryColor || '#64748b',
        accentColor: body.accentColor || '#0ea5e9',
        fontFamily: body.fontFamily || 'Inter',
        fontSize: body.fontSize || 16,
        sidebarColor: body.sidebarColor || '#0f172a',
        sidebarTextColor: body.sidebarTextColor || '#e2e8f0',
        sidebarActiveColor: body.sidebarActiveColor || '#2563eb',
        sidebarStyle: body.sidebarStyle || 'normal',
        primaryButtonColor: body.primaryButtonColor || '#2563eb',
        secondaryButtonColor: body.secondaryButtonColor || '#64748b',
        buttonBorderRadius: body.buttonBorderRadius || 'rounded',
        customCSS: body.customCSS,
      });
      return this.repo.save(created);
    }

    await this.repo.update(existing.id, body);
    return this.findByTenant(tenantId);
  }

  async getDefaults() {
    return {
      name: '',
      logoUrl: '',
      faviconUrl: '',
      primaryColor: '#2563eb',
      secondaryColor: '#64748b',
      accentColor: '#0ea5e9',
      fontFamily: 'Inter',
      fontSize: 16,
      sidebarColor: '#0f172a',
      sidebarTextColor: '#e2e8f0',
      sidebarActiveColor: '#2563eb',
      sidebarStyle: 'normal',
      primaryButtonColor: '#2563eb',
      secondaryButtonColor: '#64748b',
      buttonBorderRadius: 'rounded',
    };
  }
}
