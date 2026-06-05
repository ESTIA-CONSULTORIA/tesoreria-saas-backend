import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { CashiersService } from './cashiers.service';
import { Public } from '../auth/public.decorator';

@Controller('pos/cashiers')
export class CashiersController {
  constructor(private cashiersService: CashiersService) {}

  @Public()
  @Post('nip')
  async loginWithNip(
    @Body() body: { nip: string },
    @Headers('tenant-id') tenantId: string,
  ) {
    return this.cashiersService.loginWithNip(body.nip, tenantId);
  }
}
