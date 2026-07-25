import { Injectable, Logger } from '@nestjs/common';
import { DeliveryIngestDto } from './delivery-ingest.dto';

export interface DeliveryIngestResult {
  success: boolean;
  sale_id: string;
  was_duplicate: boolean;
}

@Injectable()
export class DeliveryIngestService {
  private readonly logger = new Logger(DeliveryIngestService.name);

  async ingest(dto: DeliveryIngestDto): Promise<DeliveryIngestResult> {
    this.logger.log(`Pedido recibido: ${dto.platform}/${dto.external_order_id} — ${dto.status} — branch ${dto.branch_id}`);
    console.log('[delivery-ingest] pedido recibido:', JSON.stringify(dto));

    return {
      success: true,
      sale_id: 'mock-id',
      was_duplicate: false,
    };
  }
}
