import { Body, Controller, Get, Post } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { Feature } from '../auth/feature/decorator';

@Controller('transfers')
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Post()
  @Feature('TREASURY')
  create(
    @Body()
    body: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      concept?: string;
    },
  ) {
    return this.transfersService.create(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
      body.concept,
    );
  }

  @Get()
  findAll() {
    return this.transfersService.findAll();
  }
}