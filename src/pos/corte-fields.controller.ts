import { Controller, Get, Put, Param, Body, Request } from '@nestjs/common';
import { CorteFieldsService } from './corte-fields.service';

@Controller('pos/corte-fields')
export class CorteFieldsController {
  constructor(private service: CorteFieldsService) {}

  @Get()
  getFields(@Request() req: any) {
    return this.service.getFields(req.user.tenantId);
  }

  @Put(':key')
  updateField(
    @Request() req: any,
    @Param('key') key: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.service.updateField(req.user.tenantId, key, body.isActive);
  }
}
