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
      primaryColor?: string;
      sidebarColor?: string;
    },
  ) {
    const existing = await this.findByTenant(tenantId);
    if (!existing) {
      const created = this.repo.create({
        tenantId,
        name: body.name,
        logoUrl: body.logoUrl,
        primaryColor: body.primaryColor || '#2563eb',
        sidebarColor: body.sidebarColor || '#0f172a',
      });
      return this.repo.save(created);
    }

    await this.repo.update(existing.id, body);
    return this.findByTenant(tenantId);
  }
}
