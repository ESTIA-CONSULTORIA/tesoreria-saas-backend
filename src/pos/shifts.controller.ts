import { Controller, Get, Post, Put, Body, Headers, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/shifts')
export class ShiftsController {
  constructor(private shiftsService: ShiftsService) {}

  @Post()
  openShift(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.shiftsService.openShift({
      ...data,
      tenantId,
    });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
  @Modulo('corte_retroactivo')
  @Post('backfill')
  createBackfill(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const cajero = req.user?.sub || req.user?.id;
    return this.shiftsService.createBackfillShift({ ...data, tenantId, cajero });
  }

  @Post(':id/withdrawal')
  withdrawal(@Param('id') id: string, @Body() data: any) {
    return this.shiftsService.withdrawal(id, data);
  }

  @Post(':id/deposit')
  deposit(@Param('id') id: string, @Body() data: any) {
    return this.shiftsService.deposit(id, data);
  }

  @Post(':id/precut')
  precut(@Param('id') id: string, @Body() data: any) {
    return this.shiftsService.precut(id, data);
  }

  @Put(':id/close')
  closeShift(@Param('id') id: string, @Body() data: any) {
    return this.shiftsService.closeShift(id, data);
  }

  @Get('open')
  getOpenShift(@Query('cajero') cajero: string, @Query('sucursalId') sucursalId: string, @Request() req, @Headers('x-branch-id') headerBranchId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    const branchId = headerBranchId || sucursalId;
    return this.shiftsService.findOpenShift(cajero, branchId, tenantId);
  }

  @Get()
  getShifts(@Query() filters: any, @Request() req, @Headers('x-branch-id') branchId?: string) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.shiftsService.findAll({
      ...filters,
      tenantId,
      // findAll() solo filtra por la clave sucursalId (mismo nombre que usa el resto del
      // sistema: entidad Shift, openShift, findOpenShift) — branchId aquí nunca se leía,
      // el filtro por sucursal en el listado no tenía efecto.
      sucursalId: branchId,
    });
  }

  @Get(':id')
  getShift(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  @Get(':id/summary')
  getShiftSummary(@Param('id') id: string) {
    return this.shiftsService.getSummary(id);
  }
}
