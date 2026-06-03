import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { PosService } from './pos.service';
import { Modulo } from '../auth/modulo.decorator';

@Controller('pos')
@Modulo('configuracion-pos')
export class PosController {
  constructor(private posService: PosService) {}

  @Get('config/:branchId')
  async getConfig(@Param('branchId') branchId: string) {
    return this.posService.findByBranch(branchId);
  }

  @Post('config')
  async createConfig(@Body() data: any) {
    return this.posService.create(data);
  }

  @Put('config/:id')
  async updateConfig(@Param('id') id: string, @Body() data: any) {
    return this.posService.update(id, data);
  }

  @Post('config/:branchId/upsert')
  async upsertConfig(@Param('branchId') branchId: string, @Body() data: any) {
    return this.posService.upsertByBranch(branchId, data);
  }

  @Post('products/import')
  async importProducts(@Body() data: { productos: any[] }) {
    return this.posService.importProducts(data.productos);
  }
}
