import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { AddonsService } from './addons.service';

@Controller('addons')
export class AddonsController {
  constructor(private addonsService: AddonsService) {}

  @Get()
  findAll(@Param('tenantId') tenantId?: string) {
    return this.addonsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.addonsService.findOne(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.addonsService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.addonsService.update(id, data);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.addonsService.delete(id);
  }

  @Get('tenant/:tenantId/modules')
  getActiveModules(@Param('tenantId') tenantId: string) {
    return this.addonsService.getActiveModulesByTenant(tenantId);
  }
}
