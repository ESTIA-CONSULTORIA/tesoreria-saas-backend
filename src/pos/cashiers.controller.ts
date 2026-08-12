import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CashiersService } from './cashiers.service';
import { Public } from '../auth/public.decorator';

@Controller('pos/cashiers')
export class CashiersController {
  constructor(private cashiersService: CashiersService) {}

  // 5 intentos / 15 min — mismo hueco de fuerza bruta que /auth/login y
  // /auth/executive-login (PIN de 4 dígitos, tenantId descubrible vía
  // /tenants/resolve/:slug, sin esto no había ninguna fricción).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('nip')
  async loginWithNip(
    @Body() body: { nip: string },
    @Headers('tenant-id') tenantId: string,
  ) {
    return this.cashiersService.loginWithNip(body.nip, tenantId);
  }
}
