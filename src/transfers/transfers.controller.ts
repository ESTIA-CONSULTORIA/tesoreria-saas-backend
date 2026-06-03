import { Body, Controller, Get, Post, Put, Param } from '@nestjs/common';
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
      tipo?: 'INTERNA' | 'INTERCOMPAÑIA';
      empresaOrigenId?: string;
      empresaDestinoId?: string;
      referencia?: string;
      motivo?: string;
    },
  ) {
    return this.transfersService.create(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
      body.concept,
      body.tipo,
      body.empresaOrigenId,
      body.empresaDestinoId,
      body.referencia,
      body.motivo,
    );
  }

  @Get()
  findAll() {
    return this.transfersService.findAll();
  }

  @Put(':id/authorize')
  @Feature('TREASURY')
  authorize(@Param('id') id: string) {
    return this.transfersService.authorize(id);
  }

  @Put(':id/reject')
  @Feature('TREASURY')
  reject(@Param('id') id: string, @Body() body: { motivo: string }) {
    return this.transfersService.reject(id, body.motivo);
  }
}