import { Body, Controller, Delete, Get, Param, Post, Query, Request, Headers } from '@nestjs/common';
import { ContractsService } from './contracts.service';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('templates')
  getTemplates(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Request() req: any,
  ) {
    const tid = tenantId || req?.user?.tenantId;
    const cid = companyId || req?.user?.companyId;
    return this.contractsService.getTemplates(tid, cid);
  }

  @Post('templates')
  uploadTemplate(
    @Body() body: any,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Request() req: any,
  ) {
    const tid = tenantId || req?.user?.tenantId;
    const cid = companyId || req?.user?.companyId;
    return this.contractsService.uploadTemplate({ ...body, tenantId: tid, companyId: cid });
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.contractsService.deleteTemplate(id);
  }

  @Get()
  getContracts(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Query('employeeId') employeeId: string,
    @Request() req: any,
  ) {
    const tid = tenantId || req?.user?.tenantId;
    const cid = companyId || req?.user?.companyId;
    return this.contractsService.getContracts(tid, employeeId, cid);
  }

  @Post('generate')
  generateContract(
    @Body() body: any,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-company-id') companyId: string,
    @Request() req: any,
  ) {
    const tid = tenantId || req?.user?.tenantId;
    const cid = companyId || req?.user?.companyId;
    return this.contractsService.generateContract({ ...body, tenantId: tid, companyId: cid });
  }

  @Post(':id/sign')
  signContract(
    @Param('id') contractId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || 'N/D';
    return this.contractsService.signContract({ ...body, contractId, ip });
  }

  @Get(':id/pdf')
  getContractPdf(@Param('id') id: string) {
    return this.contractsService.getContractPdf(id);
  }
}
