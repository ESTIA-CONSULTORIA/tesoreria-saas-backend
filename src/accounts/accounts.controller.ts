import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @Post()
  create(
    @Body()
    body: {
      branchId: string;
      name: string;
      type: string;
      currency?: string;
    },
  ) {
    return this.accountsService.create(
      body.branchId,
      body.name,
      body.type,
      body.currency,
    );
  }

  @Get()
  findAll() {
    return this.accountsService.findAll();
  }

  @Get('branch/:branchId')
  findByBranch(@Param('branchId') branchId: string) {
    return this.accountsService.findByBranch(branchId);
  }
}