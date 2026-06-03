import { Controller, Get, Post, Put, Body, Param, Query, Request } from '@nestjs/common';
import { ShiftsService } from './shifts.service';

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

  @Put(':id/close')
  closeShift(@Param('id') id: string, @Body() data: any) {
    return this.shiftsService.closeShift(id, data);
  }

  @Get('open')
  getOpenShift(@Query('cajero') cajero: string, @Query('sucursalId') sucursalId: string) {
    return this.shiftsService.findOpenShift(cajero, sucursalId);
  }

  @Get()
  getShifts(@Query() filters: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.shiftsService.findAll({
      ...filters,
      tenantId,
    });
  }

  @Get(':id')
  getShift(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }
}
