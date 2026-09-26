import { Controller, Get, Post, Put, Delete, Param, Body, Query, Request } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Modulo } from '../auth/modulo.decorator';

// Fase 1 de la agenda de citas médicas (panel interno, sin portal de paciente todavía).
// tenantId/companyId SIEMPRE de req.user (JWT) — nunca de body/query. Módulo nuevo,
// construido con el patrón correcto desde el día uno, no una auditoría posterior.
@Modulo('pacientes')
@Controller('appointments')
export class AppointmentsController {
  constructor(private service: AppointmentsService) {}

  // Vista de agenda/calendario: ?from=...&to=... (ISO). Sin ambos, devuelve todas las citas
  // del tenant.
  @Get()
  findAll(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findAll(
      req.user.tenantId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req.user.tenantId);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create(body, req.user.tenantId, req.user.companyId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.update(id, body, req.user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.tenantId);
  }

  @Put(':id/confirmar')
  confirmar(@Param('id') id: string, @Request() req: any) {
    return this.service.confirmar(id, req.user.tenantId);
  }

  @Put(':id/completar')
  completar(@Param('id') id: string, @Request() req: any) {
    return this.service.completar(id, req.user.tenantId);
  }

  @Put(':id/cancelar')
  cancelar(@Param('id') id: string, @Request() req: any) {
    return this.service.cancelar(id, req.user.tenantId);
  }
}
