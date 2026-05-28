import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { TablesService } from './tables.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/tables')
@Modulo('configuracion-pos')
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @Get()
  findAll(@Param('branchId') branchId?: string, @Param('areaId') areaId?: string) {
    return this.tablesService.findAll(branchId, areaId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.tablesService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.tablesService.update(id, data);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.tablesService.delete(id);
  }
}
