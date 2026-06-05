import { Controller, Get, Post, Put, Delete, Body, Headers, Param, Req } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/products')
@Modulo('configuracion-pos')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  findAll(@Req() req: any, @Headers('x-branch-id') headerBranchId?: string, @Param('branchId') paramBranchId?: string) {
    const tenantId = req.user?.tenantId;
    const branchId = headerBranchId || paramBranchId;
    return this.productsService.findAll(branchId, tenantId);
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
