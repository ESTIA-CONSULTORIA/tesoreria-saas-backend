import { Body, Controller, Get, Post, Put, Patch, Param, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Public } from '../auth/public.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post()
  create(
    @Body()
    body: {
      legalName: string;
      tradeName?: string;
      taxId?: string;
      plan?: string;
      email?: string;
      password?: string;
      ownerName?: string;
      rfc?: string;
      industry?: string;
      phone?: string;
      city?: string;
      state?: string;
      slug?: string;
      billingCycle?: string;
    },
  ) {
    return this.tenantsService.create(body);
  }

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Public()
  @Get('resolve/:slug')
  resolveBySlug(@Param('slug') slug: string) {
    return this.tenantsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { legalName?: string; tradeName?: string; plan?: string; isActive?: boolean },
  ) {
    return this.tenantsService.update(id, body);
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