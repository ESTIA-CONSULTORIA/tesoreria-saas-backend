import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Request } from '@nestjs/common';
import { BanksService } from './banks.service';

@Controller('banks')
export class BanksController {
  constructor(private banksService: BanksService) {}

  @Post()
  create(
    @Body()
    body: {
      branchId: string;
      name: string;
      accountNumber: string;
      bank: string;
      initialBalance: number;
      currency?: string;
      type: string;
    },
  ) {
    return this.banksService.create(
      body.branchId,
      body.name,
      body.accountNumber,
      body.bank,
      body.initialBalance,
      body.currency || 'MXN',
      body.type,
    );
  }

  @Get()
  findAll(
    @Headers('x-branch-id') headerBranchId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;

    // If user has branchId in JWT, use it and ignore headers
    if (userBranchId) {
      return this.banksService.findByBranch(userBranchId);
    }

    // If user has companyId but no branchId in JWT, use it and ignore X-Branch-Id header
    if (userCompanyId) {
      return this.banksService.findByCompany(userCompanyId);
    }

    // Otherwise, use headers (ADMIN/SOPORTE/DUEÑO case)
    if (headerBranchId) {
      return this.banksService.findByBranch(headerBranchId);
    }
    if (headerCompanyId) {
      return this.banksService.findByCompany(headerCompanyId);
    }
    return this.banksService.findAll();
  }

  @Get('branch/:branchId')
  findByBranch(@Param('branchId') branchId: string) {
    return this.banksService.findByBranch(branchId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.banksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      branchId?: string;
      name?: string;
      accountNumber?: string;
      bank?: string;
      currency?: string;
      type?: string;
      isActive?: boolean;
    },
  ) {
    return this.banksService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.banksService.remove(id);
  }
}
