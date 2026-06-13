import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Request } from '@nestjs/common';
import { HrService } from './hr.service';

@Controller('hr')
export class HrController {
  constructor(private readonly service: HrService) {}

  // Employees
  @Get('employees')
  findAll(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId ?? headerTenantId;
    const companyId = req?.user?.companyId ?? headerCompanyId;
    return this.service.findAllEmployees(tenantId, companyId);
  }

  @Post('employees')
  create(
    @Body() body: any,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId ?? headerTenantId;
    const companyId = req?.user?.companyId ?? headerCompanyId;
    return this.service.createEmployee({ ...body, tenantId, companyId });
  }

  @Put('employees/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.updateEmployee(id, body, tenantId);
  }

  @Delete('employees/:id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.removeEmployee(id, tenantId);
  }

  // Documents
  @Get('employees/:employeeId/documents')
  getDocuments(@Param('employeeId') employeeId: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.findDocsByEmployee(employeeId, tenantId);
  }

  @Post('employees/:employeeId/documents')
  addDocument(@Param('employeeId') employeeId: string, @Body() body: any) {
    return this.service.addDocument(employeeId, body);
  }

  @Delete('documents/:id')
  removeDocument(@Param('id') id: string) {
    return this.service.removeDocument(id);
  }
}
