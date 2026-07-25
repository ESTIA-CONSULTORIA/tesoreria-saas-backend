import { Body, Controller, Get, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { DeliveryIngestDto } from './delivery-ingest.dto';
import { DeliveryIngestService } from './delivery-ingest.service';

const DELIVERY_CHANNELS = [
  { platform: 'uber_eats', name: 'Uber Eats', commission_rate: 0.19 },
  { platform: 'rappi', name: 'Rappi', commission_rate: 0.3 },
  { platform: 'didi_food', name: 'DiDi Food', commission_rate: 0.17 },
  { platform: 'pedidosya', name: 'PedidosYa', commission_rate: 0.17 },
];

@Controller('integrations/delivery')
@Public()
export class DeliveryIngestController {
  constructor(private readonly deliveryIngestService: DeliveryIngestService) {}

  @Post('ingest')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  ingest(@Body() dto: DeliveryIngestDto) {
    return this.deliveryIngestService.ingest(dto);
  }

  @Get('channels')
  getChannels() {
    return DELIVERY_CHANNELS;
  }
}
