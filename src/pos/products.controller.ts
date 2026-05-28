import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/products')
@Modulo('configuracion-pos')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  findAll(@Param('branchId') branchId?: string) {
    return this.productsService.findAll(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.productsService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.productsService.update(id, data);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.productsService.delete(id);
  }
}
