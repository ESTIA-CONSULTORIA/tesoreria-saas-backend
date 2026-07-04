import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Module as ModuleEntity } from './entities/module.entity';
import { PlanModule } from './entities/plan-module.entity';
import { TenantModule } from './entities/tenant-module.entity';

@Injectable()
export class ModulesService {
  constructor(
    @InjectRepository(ModuleEntity) private moduleRepo: Repository<ModuleEntity>,
    @InjectRepository(PlanModule) private planModuleRepo: Repository<PlanModule>,
    @InjectRepository(TenantModule) private tenantModuleRepo: Repository<TenantModule>,
  ) {}

  async getTenantModules(tenantId: string): Promise<string[]> {
    const mods = await this.tenantModuleRepo.find({ where: { tenantId, status: 'active' } });
    return mods.map(m => m.moduleCode);
  }

  async hasModule(tenantId: string, moduleCode: string): Promise<boolean> {
    const mod = await this.tenantModuleRepo.findOne({ where: { tenantId, moduleCode, status: 'active' } });
    return !!mod;
  }

  async activateModule(tenantId: string, moduleCode: string, source = 'manual_support', activatedBy?: string, price = 0) {
    const existing = await this.tenantModuleRepo.findOne({ where: { tenantId, moduleCode } });
    if (existing) {
      existing.status = 'active';
      existing.source = source;
      existing.activatedBy = (activatedBy ?? null) as string;
      return this.tenantModuleRepo.save(existing);
    }
    return this.tenantModuleRepo.save(
      this.tenantModuleRepo.create({ tenantId, moduleCode, source, activatedBy, price, status: 'active' }),
    );
  }

  async deactivateModule(tenantId: string, moduleCode: string) {
    await this.tenantModuleRepo.update({ tenantId, moduleCode }, { status: 'inactive' });
  }

  getAllModules() {
    return this.moduleRepo.find({ where: { isActive: true }, order: { category: 'ASC' } });
  }

  async initFromPlan(tenantId: string, planCode: string) {
    const planMods = await this.planModuleRepo.find({ where: { planCode, included: true } });
    for (const pm of planMods) {
      const exists = await this.tenantModuleRepo.findOne({ where: { tenantId, moduleCode: pm.moduleCode } });
      if (!exists) {
        await this.tenantModuleRepo.save(
          this.tenantModuleRepo.create({ tenantId, moduleCode: pm.moduleCode, source: 'plan_base', status: 'active', price: 0 }),
        );
      }
    }
  }
}
