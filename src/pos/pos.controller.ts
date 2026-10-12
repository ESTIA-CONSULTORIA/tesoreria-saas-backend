import { Controller, Get, Post, Put, Body, Param, Req, Headers } from '@nestjs/common';
import { PosService } from './pos.service';
import { Modulo } from '../auth/modulo.decorator';
import { sucursalEfectiva, sucursalParaEscribir } from '../common/sucursal-efectiva';

@Controller('pos')
@Modulo('configuracion_pos')
export class PosController {
  constructor(private posService: PosService) {}

  @Get('config/:branchId')
  async getConfig(@Param('branchId') branchId: string, @Req() req?: any) {
    return this.posService.findByBranch(sucursalParaEscribir(req?.user, branchId) as string, req?.user?.tenantId);
  }

  @Post('config')
  async createConfig(@Body() data: any, @Req() req?: any) {
    const branchId = sucursalParaEscribir(req?.user, data?.branchId);
    return this.posService.create({ ...data, ...(branchId ? { branchId } : {}) }, req?.user?.tenantId);
  }

  @Put('config/:id')
  async updateConfig(@Param('id') id: string, @Body() data: any, @Req() req?: any) {
    return this.posService.update(id, data, req?.user?.tenantId, req?.user?.branchId);
  }

  @Post('config/:branchId/upsert')
  async upsertConfig(@Param('branchId') branchId: string, @Body() data: any, @Req() req?: any) {
    return this.posService.upsertByBranch(sucursalParaEscribir(req?.user, branchId) as string, data, req?.user?.tenantId);
  }

  @Post('products/import')
  async importProducts(
    @Body() data: { productos: any[]; branchId?: string },
    @Req() req?: any,
    @Headers('x-branch-id') headerBranchId?: string,
  ) {
    const branchId = data.branchId ? sucursalParaEscribir(req?.user, data.branchId) : sucursalEfectiva(req?.user, headerBranchId).branchId;
    return this.posService.importProducts(data.productos, req?.user?.tenantId, branchId);
  }
}
