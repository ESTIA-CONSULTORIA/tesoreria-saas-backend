import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private accountsService: AccountsService) {}

  @Post()
  create(@Body() body: CreateAccountDto) {
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
    const normalizedBranchId = String(
      branchId || '',
    ).trim();

    if (!normalizedBranchId) {
      throw new BadRequestException(
        'branchId requerido',
      );
    }

    return this.accountsService.findByBranch(
      normalizedBranchId,
    );
  }
}
