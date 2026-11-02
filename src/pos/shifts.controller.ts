import { tenantDeSesion, tenantParaListar, tenantParaEscribir } from '../auth/tenant-access.util';
import { Controller, Get, Post, Put, Body, Headers, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Modulo } from '../auth/modulo.decorator';
import { sucursalEfectiva, sucursalParaEscribir } from '../common/sucursal-efectiva';

@Controller('pos/shifts')
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Post()
  openShift(@Body() data: any, @Request() req) {
    const tenantId = tenantDeSesion(req);
    // La sucursal del turno es la del usuario; pedir otra es 403. Sin sucursal en el token (ADMIN) vale la enviada y el
    // servicio la valida contra el tenant.
    const sucursalId = sucursalParaEscribir(req.user, data?.sucursalId);
    return this.shiftsService.openShift({
      ...data,
      ...(sucursalId ? { sucursalId } : {}),
      tenantId,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Modulo('corte_retroactivo')
  @Post('backfill')
  createBackfill(@Body() data: any, @Request() req) {
    const tenantId = tenantDeSesion(req);
    const cajero = req.user?.sub || req.user?.id;
    return this.shiftsService.createBackfillShift({ ...data, tenantId, cajero });
  }

  @Post(':id/withdrawal')
  withdrawal(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.shiftsService.withdrawal(id, data, tenantId);
  }

  @Post(':id/deposit')
  deposit(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.shiftsService.deposit(id, data, tenantId);
  }

  @Post(':id/precut')
  precut(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.shiftsService.precut(id, data, tenantId);
  }

  @Put(':id/close')
  closeShift(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.shiftsService.closeShift(id, data, tenantId);
  }

  @Get('open')
  getOpenShift(@Query('cajero') cajero: string, @Query('sucursalId') sucursalId: string, @Request() req, @Headers('x-branch-id') headerBranchId?: string) {
    const tenantId = tenantParaListar(req, req?.query?.tenantId);
    const { branchId } = sucursalEfectiva(req.user, headerBranchId || sucursalId);
    return this.shiftsService.findOpenShift(cajero, branchId as string, tenantId);
  }

  @Get()
  getShifts(@Query() filters: any, @Request() req, @Headers('x-branch-id') branchId?: string) {
    const tenantId = tenantParaListar(req, req?.query?.tenantId);
    return this.shiftsService.findAll({
      ...filters,
      tenantId,
      // findAll() solo filtra por la clave sucursalId (mismo nombre que usa el resto del
      // sistema: entidad Shift, openShift, findOpenShift) — branchId aquí nunca se leía,
      // el filtro por sucursal en el listado no tenía efecto.
      sucursalId: sucursalEfectiva(req.user, branchId).branchId,
    });
  }

  @Get(':id')
  getShift(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.shiftsService.findOne(id, tenantId);
  }

  @Get(':id/summary')
  getShiftSummary(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req);
    return this.shiftsService.getSummary(id, tenantId);
  }
}
