import { Controller, Get, Post, Put, Body, Param, Query, Request } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller('pos/sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  createSale(@Body() data: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.salesService.create({
      ...data,
      tenantId,
    });
  }

  @Get()
  getSales(@Query() filters: any, @Request() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.salesService.findAll({
      ...filters,
      tenantId,
    });
  }

  @Get(':id')
  getSale(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Put(':id/pay')
  paySale(@Param('id') id: string, @Body() data: any) {
    return this.salesService.pay(id, data);
  }

  @Put(':id/cancel')
  cancelSale(@Param('id') id: string, @Body() data: { motivo: string }) {
    return this.salesService.cancel(id, data.motivo);
  }

  @Put(':id/discount')
  applyDiscount(@Param('id') id: string, @Body() data: { descuento: number; nuevoTotal: number }) {
    return this.salesService.applyDiscount(id, data.descuento, data.nuevoTotal);
  }

  @Post(':id/return')
  returnSale(@Param('id') id: string, @Body() data: any) {
    return this.salesService.returnSale(id, data);
  }
}
