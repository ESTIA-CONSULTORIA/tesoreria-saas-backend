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

  // Catálogo ligero (solo id/nombre) para el selector de insumo real de CorteCajaLite.tsx.
  // Vive acá y no en CostsController a propósito: ese controller entero está gateado por
  // @Modulo('costos'), y un tenant sin ese módulo (BOCATTA, confirmado) puede igual tener
  // insumos reales que un cajero necesita elegir al reportar un aviso.
  @Get('insumos-lista')
  listInsumos(@Request() req: any) {
    return this.service.listInsumosLigero(req.user.tenantId);
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
