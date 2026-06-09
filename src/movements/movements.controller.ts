import { Body, Controller, Get, Headers, Param, Post, Query, Request } from '@nestjs/common';
import { MovementsService } from './movements.service';

@Controller('movements')
export class MovementsController {
  constructor(private movementsService: MovementsService) {}

  @Post()
  create(
    @Body()
    body: {
      accountId: string;
      type: string;
      category: string;
      concept: string;
      reference?: string;
      amount: number;
    },
  ) {
    return this.movementsService.create(
      body.accountId,
      body.type,
      body.category,
      body.concept,
      body.amount,
      body.reference,
    );
  }

  @Get()
  findAll(
    @Headers('x-branch-id') headerBranchId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Query('accountId') accountId?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    const userBranchId = req?.user?.branchId;
    const userCompanyId = req?.user?.companyId;

    // If user has branchId in JWT, use it and ignore headers
    if (userBranchId) {
      return this.movementsService.findByBranch(userBranchId);
    }

    // If user has companyId but no branchId in JWT, use it and ignore X-Branch-Id header
    if (userCompanyId) {
      return this.movementsService.findByCompany(userCompanyId);
    }

    // Otherwise, use headers (ADMIN/SOPORTE/DUEÑO case)
    if (headerBranchId) {
      return this.movementsService.findByBranch(headerBranchId);
    }
    
    if (headerCompanyId) {
      return this.movementsService.findByCompany(headerCompanyId);
    }

    if (accountId || type || category || startDate || endDate || page || limit) {
      return this.movementsService.findWithFilters(
        accountId,
        type,
        category,
        startDate,
        endDate,
        Number(page || 1),
        Number(limit || 10),
      );
    }

    return this.movementsService.findAll();
  }

  @Get('account/:accountId')
  findByAccount(@Param('accountId') accountId: string) {
    return this.movementsService.findByAccount(accountId);
  }
}