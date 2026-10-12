import { Controller, Get, Post, Put, Delete, Body, Param, Req, Headers } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Modulo } from '../auth/modulo.decorator';
import { sucursalEfectiva, sucursalParaEscribir } from '../common/sucursal-efectiva';

@Controller('pos/categories')
@Modulo('configuracion_pos')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  findAll(@Req() req: any, @Headers('x-branch-id') headerBranchId?: string) {
    const { branchId } = sucursalEfectiva(req.user, headerBranchId);
    return this.categoriesService.findAll(branchId, req.user?.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.categoriesService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() data: any, @Req() req?: any, @Headers('x-branch-id') headerBranchId?: string) {
    // Sucursal efectiva: la del token; sin sucursal (ADMIN) la del cuerpo o la activa, validada contra el tenant; si no hay, NULL.
    const branchId = sucursalParaEscribir(req?.user, data?.branchId) ?? sucursalEfectiva(req?.user, headerBranchId).branchId;
    return this.categoriesService.create({ ...data, branchId: branchId ?? null }, req?.user?.tenantId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.categoriesService.update(id, data, tenantId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.categoriesService.delete(id, tenantId);
  }
}
