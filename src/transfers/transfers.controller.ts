import { Body, Controller, ForbiddenException, Get, Post, Put, Param, Req } from '@nestjs/common';
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
    @Req() req,
  ) {
    const tenantId = req.user?.tenantId || req.tenantId;
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
      tenantId,
    );
  }

  @Get()
  findAll(@Req() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.transfersService.findAll(tenantId);
  }

  @Put(':id/authorize')
  @Feature('TREASURY')
  authorize(@Param('id') id: string, @Req() req: any) {
    const roleCode = req?.user?.roleCode;
    if (!['ADMIN'].includes(roleCode)) {
      throw new ForbiddenException('Solo los administradores pueden autorizar transferencias');
    }
    return this.transfersService.authorize(id);
  }

  @Put(':id/reject')
  @Feature('TREASURY')
  reject(@Param('id') id: string, @Body() body: { motivo: string }) {
    return this.transfersService.reject(id, body.motivo);
  }
}