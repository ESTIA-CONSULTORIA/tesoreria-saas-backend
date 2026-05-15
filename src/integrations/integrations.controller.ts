import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { IntegrationsService } from './integrations.service';
import { Integration } from './entities/integration.entity';

@Controller('integrations')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Post()
  create(@Body() body: Partial<Integration>) {
    return this.integrationsService.create(body);
  }

  @Get()
  findAll() {
    return this.integrationsService.findAll();
  }

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.integrationsService.findByCompany(companyId);
  }
}
