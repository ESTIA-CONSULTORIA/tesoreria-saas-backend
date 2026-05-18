import { Body, Controller, Post } from '@nestjs/common';

import { Feature } from '../auth/feature/decorator';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Post()
  @Feature('TREASURY')
  create(@Body() body: CreateTransferDto) {
    return this.transfersService.create(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
      body.concept,
    );
  }
}
