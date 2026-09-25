import { Controller, Get, Post, Put, Delete, Body, Param, Req, Headers } from '@nestjs/common';
import { AreasService } from './areas.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos/areas')
@Modulo('configuracion_pos')
export class AreasController {
  constructor(private areasService: AreasService) {}

  @Get()
  findAll(@Req() req: any, @Headers('x-branch-id') headerBranchId?: string) {
    const branchId = headerBranchId || req.user?.branchId;
    return this.areasService.findAll(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.areasService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() data: any) {
    return this.areasService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.areasService.update(id, data, tenantId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.areasService.delete(id, tenantId);
  }
}
