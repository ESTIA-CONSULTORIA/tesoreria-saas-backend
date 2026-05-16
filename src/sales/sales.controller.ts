import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';

@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  createSale(
    @Body()
    body: Partial<Sale> & {
      items?: Partial<SaleItem>[];
    },
  ) {
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
