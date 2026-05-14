import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  create(
    @Body()
    body: {
      tenantId: string;
      legalName: string;
      tradeName: string;
      taxId?: string;
      baseCurrency?: string;
    },
  ) {
    return this.companiesService.create(
      body.tenantId,
      body.legalName,
      body.tradeName,
      body.taxId,
      body.baseCurrency,
    );
  }

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('tenant/:tenantId')
  findByTenant(@Param('tenantId') tenantId: string) {
    return this.companiesService.findByTenant(tenantId);
  }
}