import { Module as NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module as ModuleEntity } from './entities/module.entity';
import { PlanModule } from './entities/plan-module.entity';
import { TenantModule } from './entities/tenant-module.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';

@NestModule({
  // Tenant agregado para Hallazgo 3 (giro) — solo el repositorio, ModulesModule no importa
  // TenantsModule completo (evita el ciclo, ver comentario en modules.service.ts).
  imports: [TypeOrmModule.forFeature([ModuleEntity, PlanModule, TenantModule, Tenant])],
  providers: [ModulesService],
  controllers: [ModulesController],
  exports: [ModulesService],
})
export class ModulesModule {}
