import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Request } from '@nestjs/common';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  @Post()
  create(
    @Body()
    body: {
      companyId: string;
      code: string;
      name: string;
      address?: string;
      city?: string;
      state?: string;
    },
  ) {
    return this.branchesService.create(
      body.companyId,
      body.code,
      body.name,
      body.address,
      body.city,
      body.state,
    );
  }

  @Get()
  findAll(
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const userCompanyId = req?.user?.companyId;
    const tenantId = req?.user?.tenantId || req?.tenantId;

    // If user has companyId in JWT, use it and ignore header
    if (userCompanyId) {
      return this.branchesService.findByCompany(userCompanyId);
    }

    // If user has tenantId in JWT, filter by tenant
    if (tenantId) {
      return this.branchesService.findByTenant(tenantId);
    }

    // Otherwise, use header if present
    if (headerCompanyId) {
      return this.branchesService.findByCompany(headerCompanyId);
    }

    return this.branchesService.findAll();
  }

  @Get('company/:companyId')
  findByCompany(@Param('companyId') companyId: string) {
    return this.branchesService.findByCompany(companyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      companyId?: string;
      code?: string;
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      isActive?: boolean;
    },
  ) {
    return this.branchesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.branchesService.remove(id);
  }
}