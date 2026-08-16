import { Body, Controller, Get, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { DeliveryIngestDto } from './delivery-ingest.dto';
import { DeliveryIngestService } from './delivery-ingest.service';

const DELIVERY_CHANNELS = [
  { platform: 'uber_eats', name: 'Uber Eats', commission_rate: 0.19 },
  { platform: 'rappi', name: 'Rappi', commission_rate: 0.3 },
  { platform: 'didi_food', name: 'DiDi Food', commission_rate: 0.17 },
  { platform: 'pedidosya', name: 'PedidosYa', commission_rate: 0.17 },
];

// Ya NO es @Public(): DeliveryHub Pro autentica con la cuenta de servicio
// deliveryhub@service.estia (SOPORTE, tenantId null) y manda Bearer token en cada
// request (ver estia.client.ts del lado de DeliveryHub) — SubscriptionGuard ya bypasea
// a SOPORTE sin pedirle tenantId (subscription.guard.ts:37), así que dejar que el guard
// global aplique acá es gratis: exige sesión válida sin requerir nada nuevo del otro lado.
@Controller('integrations/delivery')
export class DeliveryIngestController {
  constructor(private readonly deliveryIngestService: DeliveryIngestService) {}

  @Post('ingest')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  ingest(@Body() dto: DeliveryIngestDto, @Req() req: Request) {
    return this.deliveryIngestService.ingest(dto, {
      ip: req.ip || (req.socket && req.socket.remoteAddress) || '',
      userAgent: req.headers['user-agent'] || '',
    });
  }

  @Get('channels')
  getChannels() {
    return DELIVERY_CHANNELS;
  }
}
