import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryIngestController } from './delivery-ingest.controller';
import { DeliveryIngestService } from './delivery-ingest.service';
import { Sale } from '../../pos/entities/sale.entity';
import { AuditModule } from '../../audit/audit.module';

@Module({
  // Bank/Company/Branch/Movement se acceden vía dataSource.getRepository() dentro del
  // service (mismo patrón que sales.service.ts usa para Branch) — no hacen falta acá.
  imports: [TypeOrmModule.forFeature([Sale]), AuditModule],
  controllers: [DeliveryIngestController],
  providers: [DeliveryIngestService],
  exports: [DeliveryIngestService],
})
export class DeliveryIngestModule {}
