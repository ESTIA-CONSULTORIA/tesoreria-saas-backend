import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdministrationService } from './administration.service';
import { AdministrationController } from './administration.controller';
import { AuditLog } from '../audit/audit.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantSetting } from '../tenant-settings/entities/tenant-setting.entity';
import { DeliveryIngestModule } from '../integrations/delivery/delivery-ingest.module';

@Module({
  // DeliveryIngestModule: expone DeliveryIngestService.listQuarantine()/resolveQuarantine()
  // para los 2 endpoints de cuarentena de delivery — misma lógica de negocio que ya vive en
  // el módulo de delivery, este controller solo la expone bajo la ruta SOPORTE-only.
  imports: [TypeOrmModule.forFeature([AuditLog, Tenant, TenantSetting]), DeliveryIngestModule],
  controllers: [AdministrationController],
  providers: [AdministrationService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
