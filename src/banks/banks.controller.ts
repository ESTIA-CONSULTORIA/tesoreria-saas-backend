import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { BanksService } from './banks.service';

@Controller('banks')
export class BanksController {
  constructor(private banksService: BanksService) {}

  @Post()
  create(
    @Body()
    body: {
      branchId: string;
      name: string;
      accountNumber: string;
      bank: string;
      initialBalance: number;
      currency?: string;
      type: string;
    },
  ) {
    return this.banksService.create(
      body.branchId,
      body.name,
      body.accountNumber,
      body.bank,
      body.initialBalance,
      body.currency || 'MXN',
      body.type,
    );
  }

  @Get()
  findAll() {
    return this.banksService.findAll();
  }

  @Get('branch/:branchId')
  findByBranch(@Param('branchId') branchId: string) {
    return this.banksService.findByBranch(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.banksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      branchId?: string;
      name?: string;
      accountNumber?: string;
      bank?: string;
      currency?: string;
      type?: string;
      isActive?: boolean;
    },
  ) {
    return this.banksService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.banksService.remove(id);
  }
}
