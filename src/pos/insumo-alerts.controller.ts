import { Controller, Get, Post, Put, Param, Body, Request } from '@nestjs/common';
import { InsumoAlertsService } from './insumo-alerts.service';

@Controller('pos/insumo-alerts')
export class InsumoAlertsController {
  constructor(private service: InsumoAlertsService) {}

  @Get()
  getAlerts(@Request() req: any) {
    return this.service.getAlerts(req.user.tenantId);
  }

  @Get('all')
  getAllAlerts(@Request() req: any) {
    return this.service.getAllAlerts(req.user.tenantId);
  }

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.service.upsert(req.user.tenantId, body.companyId, req.user.id, body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { estado: string; notas?: string }) {
    return this.service.updateEstado(id, body.estado, body.notas);
  }
}
