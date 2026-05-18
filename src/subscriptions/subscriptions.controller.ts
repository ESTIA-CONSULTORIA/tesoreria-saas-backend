import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subsService: SubscriptionsService) {}

  @Post()
  create(@Body() body: CreateSubscriptionDto) {
    return this.subsService.create(body);
  }

  @Get('tenant/:tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.subsService.findByTenant(tenantId);
  }
}
