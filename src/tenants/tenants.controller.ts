import { Body, Controller, Get, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Post()
  create(
    @Body()
    body: {
      legalName: string;
      tradeName: string;
      taxId?: string;
    },
  ) {
    return this.tenantsService.create(
      body.legalName,
      body.tradeName,
      body.taxId,
    );
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }
}