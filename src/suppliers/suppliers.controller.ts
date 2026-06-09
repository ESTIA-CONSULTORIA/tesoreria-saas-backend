import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Headers } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('suppliers')
@Modulo('proveedores')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Req() req?: any,
  ) {
    const tenantIdFromReq = tenantId || req?.user?.tenantId || req?.tenantId;
    const userCompanyId = req?.user?.companyId;
    const companyId = userCompanyId || headerCompanyId;
    const isActiveBool = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.suppliersService.findAll(tenantIdFromReq, search, isActiveBool, companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Get(':id/purchases')
  async getSupplierPurchases(@Param('id') id: string) {
    // Por ahora retorna un array vacío, se implementará cuando se cree el módulo de compras
    return [];
  }

  @Post()
  create(@Body() data: any, @Req() req?: any) {
    const tenantId = req?.user?.tenantId || req?.tenantId;
    return this.suppliersService.create({ ...data, tenantId });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.suppliersService.update(id, data);
  }

  @Put(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.suppliersService.softDelete(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.suppliersService.delete(id);
  }
}
