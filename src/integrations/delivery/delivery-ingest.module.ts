import { Module } from '@nestjs/common';
import { DeliveryIngestController } from './delivery-ingest.controller';
import { DeliveryIngestService } from './delivery-ingest.service';

@Module({
  controllers: [DeliveryIngestController],
  providers: [DeliveryIngestService],
  exports: [DeliveryIngestService],
})
export class DeliveryIngestModule {}
