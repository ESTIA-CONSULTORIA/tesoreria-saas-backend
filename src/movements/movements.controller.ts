import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { MovementsService } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';

@Controller('movements')
export class MovementsController {
  constructor(private movementsService: MovementsService) {}

  @Post()
  create(@Body() body: CreateMovementDto) {
    return this.movementsService.create(
      body.accountId,
      body.type,
      body.category,
      body.concept,
      body.amount,
      body.reference,
    );
  }

  @Get()
  findAll() {
    return this.movementsService.findAll();
  }

  @Get('account/:accountId')
  findByAccount(@Param('accountId') accountId: string) {
    return this.movementsService.findByAccount(accountId);
  }
}
