import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrationService } from './administration.service';
import { AdministrationController } from './administration.controller';
import { AuditLog } from './entities/audit-log.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Tenant, TenantSetting])],
  controllers: [AdministrationController],
  providers: [AdministrationService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
