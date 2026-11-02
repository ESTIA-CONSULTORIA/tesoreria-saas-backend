import { tenantDeSesion, tenantParaEscribir } from '../auth/tenant-access.util';
import { Controller, Get, Post, Put, Param, Body, Query, Request } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { Modulo } from '../auth/modulo.decorator';

// Auditoría de seguridad (GoodsHabits, P1): sin @Modulo() un tenant sin el addon
// Pacientes ($250, catálogo modules.code='pacientes') podía llamar /patients directo.
@Modulo('pacientes')
@Controller('patients')
export class PatientsController {
  constructor(private service: PatientsService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(tenantParaEscribir(req, req?.query?.tenantId), req.user.companyId);
  }

  @Get('kpis')
  getKpis(@Request() req: any, @Query('from') from: string, @Query('to') to: string) {
    const fromDate = from ? new Date(from) : new Date(new Date().setDate(1));
    const toDate = to ? new Date(to) : new Date();
    return this.service.getKpis(tenantParaEscribir(req, req?.query?.tenantId), fromDate, toDate);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, tenantParaEscribir(req, req?.query?.tenantId));
  }

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.service.create({ ...body, tenantId: tenantParaEscribir(req, req?.query?.tenantId), companyId: req.user.companyId });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.update(id, body, tenantParaEscribir(req, req?.query?.tenantId));
  }

  @Get(':id/consultas')
  getConsultas(@Param('id') id: string, @Request() req: any) {
    return this.service.findConsultas(tenantParaEscribir(req, req?.query?.tenantId), id);
  }

  @Post('consultas')
  createConsulta(@Request() req: any, @Body() body: any) {
    return this.service.createConsulta({ ...body, tenantId: tenantParaEscribir(req, req?.query?.tenantId), companyId: req.user.companyId });
  }

  @Put('consultas/:id')
  updateConsulta(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    return this.service.updateConsulta(id, body, tenantDeSesion(req));
  }
}
