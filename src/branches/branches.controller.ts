import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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
  findAll() {
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