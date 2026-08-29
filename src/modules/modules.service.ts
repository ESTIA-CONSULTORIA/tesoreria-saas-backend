import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Module as ModuleEntity } from './entities/module.entity';
import { PlanModule } from './entities/plan-module.entity';
import { TenantModule } from './entities/tenant-module.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { DEFAULT_GIRO } from '../config/giros.config';
import { moduleAllowedForGiro } from '../config/module-giro-requirements.config';

@Injectable()
export class ModulesService {
  constructor(
    @InjectRepository(ModuleEntity) private moduleRepo: Repository<ModuleEntity>,
    @InjectRepository(PlanModule) private planModuleRepo: Repository<PlanModule>,
    @InjectRepository(TenantModule) private tenantModuleRepo: Repository<TenantModule>,
    // Auditoría de producto (GoodsHabits, Hallazgo 3): solo el repositorio de Tenant, no
    // TenantsService completo — TenantsService ya inyecta ModulesService, inyectar de
    // vuelta el service completo crearía una dependencia circular entre módulos Nest.
    @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
  ) {}

  async getTenantModules(tenantId: string): Promise<string[]> {
    const mods = await this.tenantModuleRepo.find({ where: { tenantId, status: 'active' } });
    return mods.map(m => m.moduleCode);
  }

  async hasModule(tenantId: string, moduleCode: string): Promise<boolean> {
    const mod = await this.tenantModuleRepo.findOne({ where: { tenantId, moduleCode, status: 'active' } });
    return !!mod;
  }

  // Auditoría de producto (GoodsHabits, Hallazgo 3): capa ADICIONAL sobre lo que ya permite
  // el plan — nunca activa algo que el giro del tenant no permite, activado a mano desde
  // el panel de SOPORTE o no. Si el tenant no existe, se trata como 'generico' (falla
  // cerrado hacia el catálogo más restrictivo, no abierto).
  async activateModule(tenantId: string, moduleCode: string, source = 'manual_support', activatedBy?: string, price = 0) {
    const giro = await this.resolveGiro(tenantId);
    if (!moduleAllowedForGiro(moduleCode, giro)) {
      throw new BadRequestException(
        `El módulo "${moduleCode}" no está disponible para el giro "${giro}" de este tenant.`,
      );
    }

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

  private async resolveGiro(tenantId: string): Promise<string> {
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    return tenant?.giro || DEFAULT_GIRO;
  }

  // giro opcional: si no se pasa, se resuelve del tenant (columna "giro", default
  // 'generico'). Se deja como parámetro explícito para que el alta de tenant
  // (tenants.service.ts) pueda pasar el giro elegido en el mismo formulario, sin depender
  // de que ya esté persistido en ese momento exacto del flujo.
  async initFromPlan(tenantId: string, planCode: string, giro?: string) {
    const resolvedGiro = giro || (await this.resolveGiro(tenantId));
    const planMods = await this.planModuleRepo.find({ where: { planCode, included: true } });
    for (const pm of planMods) {
      if (!moduleAllowedForGiro(pm.moduleCode, resolvedGiro)) continue; // el plan lo incluye, el giro no lo permite
      const exists = await this.tenantModuleRepo.findOne({ where: { tenantId, moduleCode: pm.moduleCode } });
      if (!exists) {
        await this.tenantModuleRepo.save(
          this.tenantModuleRepo.create({ tenantId, moduleCode: pm.moduleCode, source: 'plan_base', status: 'active', price: 0 }),
        );
      }
    }
  }

  // Auditoría de producto (GoodsHabits, Hallazgo 3): al cambiar el giro de un tenant
  // existente (tenants.service.ts::update), re-evalúa sus módulos ACTIVOS contra el giro
  // nuevo y desactiva los que ya no califiquen. A propósito no reactiva nada — un módulo
  // que el giro nuevo permitiría pero el plan no incluye sigue sin activarse solo, igual
  // que cualquier otra activación manual vía SOPORTE.
  async reconcileGiro(tenantId: string, giro: string) {
    const active = await this.tenantModuleRepo.find({ where: { tenantId, status: 'active' } });
    for (const tm of active) {
      if (!moduleAllowedForGiro(tm.moduleCode, giro)) {
        await this.deactivateModule(tenantId, tm.moduleCode);
      }
    }
  }
}
