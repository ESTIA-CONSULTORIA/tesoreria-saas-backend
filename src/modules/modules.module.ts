import { Module as NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module as ModuleEntity } from './entities/module.entity';
import { PlanModule } from './entities/plan-module.entity';
import { TenantModule } from './entities/tenant-module.entity';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';

@NestModule({
  imports: [TypeOrmModule.forFeature([ModuleEntity, PlanModule, TenantModule])],
  providers: [ModulesService],
  controllers: [ModulesController],
  exports: [ModulesService],
})
export class ModulesModule {}
