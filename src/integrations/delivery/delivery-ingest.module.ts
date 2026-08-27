import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryIngestController } from './delivery-ingest.controller';
import { DeliveryIngestService } from './delivery-ingest.service';
import { DeliveryQuarantine } from './entities/delivery-quarantine.entity';
import { Sale } from '../../pos/entities/sale.entity';
import { AuditModule } from '../../audit/audit.module';
import { ModulesModule } from '../../modules/modules.module';

@Module({
  // Bank/Company/Branch/Movement se acceden vía dataSource.getRepository() dentro del
  // service (mismo patrón que sales.service.ts usa para Branch) — no hacen falta acá.
  // ModulesModule: exporta ModulesService, usado para el chequeo de cuarentena y para
  // activar el módulo al resolver un pedido. exports: DeliveryIngestService para que
  // administration.module.ts pueda llamar a listQuarantine()/resolveQuarantine().
  imports: [TypeOrmModule.forFeature([Sale, DeliveryQuarantine]), AuditModule, ModulesModule],
  controllers: [DeliveryIngestController],
  providers: [DeliveryIngestService],
  exports: [DeliveryIngestService],
})
export class DeliveryIngestModule {}
