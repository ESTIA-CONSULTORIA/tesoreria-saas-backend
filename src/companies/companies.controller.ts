import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  create(@Body() body: CreateCompanyDto) {
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
