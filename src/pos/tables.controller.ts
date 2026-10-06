import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Headers } from '@nestjs/common';
import { TablesService } from './tables.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/tables')
@Modulo('configuracion_pos')
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @Get()
  // Filtros por query (?branchId=&areaId=) o header x-branch-id. Antes eran @Param de una ruta que no
  // los tiene, así que nunca llegaban: el filtro de sucursal no funcionaba.
  findAll(
    @Req() req?: any,
    @Query('branchId') branchId?: string,
    @Query('areaId') areaId?: string,
    @Headers('x-branch-id') headerBranchId?: string,
  ) {
    return this.tablesService.findAll(branchId || headerBranchId, areaId, req?.user?.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.tablesService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() data: any, @Req() req?: any) {
    // JWT primero; body.tenantId solo como fallback para SOPORTE — mismo criterio que
    // products/cashiers/users/companies.
    const tenantId = req?.user?.tenantId || data?.tenantId;
    return this.tablesService.create(data, tenantId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.tablesService.update(id, data, tenantId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.tablesService.delete(id, tenantId);
  }
}
