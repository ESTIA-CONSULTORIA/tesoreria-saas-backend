import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutiveConfig } from './entities/executive-config.entity';

@Injectable()
export class ExecutiveConfigService {
  constructor(
    @InjectRepository(ExecutiveConfig)
    private repo: Repository<ExecutiveConfig>,
  ) {}

  findByTenant(tenantId: string) {
    return this.repo.findOne({ where: { tenantId } });
  }

  async upsert(tenantId: string, body: { theme?: string; modules?: Record<string, boolean> }) {
    const existing = await this.findByTenant(tenantId);
    if (!existing) {
      const created = this.repo.create({
        tenantId,
        theme: body.theme || 'dark',
        modules: body.modules || {},
      });
      return this.repo.save(created);
    }

    await this.repo.update(existing.id, body);
    return this.findByTenant(tenantId);
  }
}
