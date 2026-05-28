import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MovementsService } from './movements.service';

@Controller('movements')
export class MovementsController {
  constructor(private movementsService: MovementsService) {}

  @Post()
  create(
    @Body()
    body: {
      accountId: string;
      type: string;
      category: string;
      concept: string;
      reference?: string;
      amount: number;
    },
  ) {
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
  findAll(
    @Query('accountId') accountId?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (accountId || type || category || startDate || endDate || page || limit) {
      return this.movementsService.findWithFilters(
        accountId,
        type,
        category,
        startDate,
        endDate,
        Number(page || 1),
        Number(limit || 10),
      );
    }

    return this.movementsService.findAll();
  }

  @Get('account/:accountId')
  findByAccount(@Param('accountId') accountId: string) {
    return this.movementsService.findByAccount(accountId);
  }
}