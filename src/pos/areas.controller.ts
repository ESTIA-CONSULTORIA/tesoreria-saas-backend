import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { AreasService } from './areas.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/areas')
@Modulo('configuracion-pos')
export class AreasController {
  constructor(private areasService: AreasService) {}

  @Get()
  findAll(@Param('branchId') branchId?: string) {
    return this.areasService.findAll(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.areasService.findOne(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.areasService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.areasService.update(id, data);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.areasService.delete(id);
  }
}
