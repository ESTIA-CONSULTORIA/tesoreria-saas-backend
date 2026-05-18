import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  createSale(@Body() body: CreateSaleDto) {
    return this.salesService.createSale(body);
  }

  @Get()
  findRecentSales() {
    return this.salesService.findRecentSales();
  }

  @Get(':id')
  findSale(@Param('id') id: string) {
    return this.salesService.findSale(id);
  }
}
