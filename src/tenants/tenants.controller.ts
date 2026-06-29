import { Body, Controller, Get, Post, Put, Patch, Param } from '@nestjs/common';
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
      plan?: string;
    },
  ) {
    return this.tenantsService.create(
      body.legalName,
      body.tradeName,
      body.taxId,
      body.plan,
    );
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id/plan')
  updatePlan(@Param('id') id: string, @Body('plan') plan: string) {
    return this.tenantsService.updatePlan(id, plan);
  }

  @Patch(':id/onboard')
  markOnboarded(@Param('id') id: string) {
    return this.tenantsService.markOnboarded(id);
  }
}