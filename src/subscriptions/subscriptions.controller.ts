import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { Subscription } from './entities/subscription.entity';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subsService: SubscriptionsService) {}

  @Post()
  create(@Body() body: Partial<Subscription>) {
    return this.subsService.create(body);
  }

  @Get('tenant/:tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.subsService.findByTenant(tenantId);
  }
}