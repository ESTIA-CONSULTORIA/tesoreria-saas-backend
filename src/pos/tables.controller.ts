import { Controller, Get, Post, Put, Delete, Body, Param, Req } from '@nestjs/common';
import { TablesService } from './tables.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/tables')
@Modulo('configuracion_pos')
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @Get()
  findAll(@Req() req?: any, @Param('branchId') branchId?: string, @Param('areaId') areaId?: string) {
    return this.tablesService.findAll(branchId, areaId, req?.user?.tenantId);
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
