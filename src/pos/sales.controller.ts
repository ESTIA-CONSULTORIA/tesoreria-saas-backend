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
  getSale(@Param('id') id: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.findOne(id, tenantId);
  }

  @Put(':id/pay')
  paySale(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.pay(id, data, tenantId);
  }

  @Put(':id/cancel')
  cancelSale(@Param('id') id: string, @Body() data: { motivo: string }, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.cancel(id, data.motivo, tenantId);
  }

  @Put(':id/discount')
  applyDiscount(
    @Param('id') id: string,
    @Body() data: { descuento: number; nuevoTotal: number },
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.applyDiscount(id, data.descuento, data.nuevoTotal, tenantId);
  }

  @Post(':id/return')
  returnSale(@Param('id') id: string, @Body() data: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.salesService.returnSale(id, data, tenantId);
  }
}
