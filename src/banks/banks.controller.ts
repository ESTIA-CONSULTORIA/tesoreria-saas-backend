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
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId;
    const branchId = req?.user?.branchId || body.branchId;
    return this.banksService.create(
      branchId,
      body.name,
      body.accountNumber,
      body.bank,
      body.initialBalance,
      body.currency || 'MXN',
      body.type,
      tenantId,
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

    // Header (Switch Context) has priority over JWT claims
    const branchId = headerBranchId || userBranchId;
    const companyId = headerCompanyId || userCompanyId;
    if (branchId) return this.banksService.findByBranch(branchId);
    if (companyId) return this.banksService.findByCompany(companyId);

    const tenantId = req?.user?.tenantId;
    if (tenantId) return this.banksService.findByTenant(tenantId);

    return [];
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
