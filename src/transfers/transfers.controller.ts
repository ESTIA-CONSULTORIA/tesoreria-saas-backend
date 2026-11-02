import { Body, Controller, ForbiddenException, Get, Post, Put, Param, Req } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { Modulo } from '../auth/modulo.decorator';
import { tenantDeSesion, tenantParaListar, tenantParaEscribir } from '../auth/tenant-access.util';

@Controller('transfers')
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Post()
  @Modulo('tesoreria')
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
    const tenantId = tenantParaEscribir(req, req?.query?.tenantId);
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
  @Modulo('tesoreria')
  findAll(@Req() req) {
    const tenantId = tenantParaListar(req, req?.query?.tenantId);
    return this.transfersService.findAll(tenantId);
  }

  @Put(':id/authorize')
  @Modulo('tesoreria')
  authorize(@Param('id') id: string, @Req() req: any) {
    const roleCode = req?.user?.roleCode;
    if (!['ADMIN'].includes(roleCode)) {
      throw new ForbiddenException('Solo los administradores pueden autorizar transferencias');
    }
    const tenantId = tenantDeSesion(req);
    return this.transfersService.authorize(id, tenantId);
  }

  @Put(':id/reject')
  @Modulo('tesoreria')
  reject(@Param('id') id: string, @Body() body: { motivo: string }, @Req() req: any) {
    const tenantId = tenantDeSesion(req);
    return this.transfersService.reject(id, body.motivo, tenantId);
  }
}