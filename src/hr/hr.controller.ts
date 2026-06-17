import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Request, Query } from '@nestjs/common';
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

  // Shifts (HR turnos, not POS)
  @Get('shifts')
  findShifts(@Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.findAllShifts(tenantId);
  }

  @Post('shifts')
  createShift(@Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.createShift({ ...body, tenantId });
  }

  @Put('shifts/:id')
  updateShift(@Param('id') id: string, @Body() body: any) {
    return this.service.updateShift(id, body);
  }

  @Delete('shifts/:id')
  deleteShift(@Param('id') id: string) {
    return this.service.deleteShift(id);
  }

  // Pending requests (admin view)
  @Get('requests/pending')
  getPending(@Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.findPendingRequests(tenantId);
  }

  // Vacation requests
  @Post('requests/vacation')
  createVacation(@Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.createVacationRequest({ ...body, tenantId });
  }

  @Put('requests/vacation/:id/approve')
  approveVacation(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.approveVacation(id, approvedBy, body.responseNote);
  }

  @Put('requests/vacation/:id/reject')
  rejectVacation(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.rejectVacation(id, approvedBy, body.responseNote);
  }

  // Permission requests
  @Post('requests/permission')
  createPermission(@Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.createPermissionRequest({ ...body, tenantId });
  }

  @Put('requests/permission/:id/approve')
  approvePermission(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.approvePermission(id, approvedBy, body.responseNote);
  }

  @Put('requests/permission/:id/reject')
  rejectPermission(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.rejectPermission(id, approvedBy, body.responseNote);
  }

  // Attendance
  @Get('attendance/today')
  getAttendanceToday(@Headers('x-branch-id') branchId?: string, @Request() req?: any) {
    const bid = req?.user?.branchId || branchId;
    return this.service.findAttendanceToday(bid);
  }

  @Get('attendance/employee/:employeeId')
  getAttendanceByEmployee(
    @Param('employeeId') employeeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.findAttendanceByEmployee(
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Post('attendance/check-in')
  checkIn(@Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    const branchId = req?.user?.branchId || body.branchId;
    const employeeId = body.employeeId || req?.user?.employeeId;
    return this.service.checkIn(employeeId, tenantId, branchId, body.method, body.lat, body.lng);
  }

  @Post('attendance/check-out')
  checkOut(@Body() body: any, @Request() req?: any) {
    const employeeId = body.employeeId || req?.user?.employeeId;
    return this.service.checkOut(employeeId);
  }

  // Biometrics
  @Post('biometrics/face/register')
  registerFace(@Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.registerFace(body.employeeId, tenantId, body.faceDescriptor);
  }

  @Post('biometrics/face/verify')
  verifyFace(@Body() body: any, @Request() req?: any) {
    const tenantId = req?.user?.tenantId || body.tenantId;
    return this.service.verifyFace(body.faceDescriptor, tenantId);
  }

  @Get('biometrics')
  getBiometrics(@Request() req?: any) {
    const tenantId = req?.user?.tenantId;
    return this.service.findBiometricsByTenant(tenantId);
  }

  // Portal portal empleado
  @Get('portal/me')
  getPortalMe(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.findEmployeeByUserId(userId);
  }

  @Get('portal/documents')
  getPortalDocuments(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.findEmployeeByUserId(userId).then((emp) => {
      if (!emp) return [];
      return this.service.findDocsByEmployee(emp.id, emp.tenantId);
    });
  }

  @Get('portal/requests')
  getPortalRequests(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.findEmployeeByUserId(userId).then(async (emp) => {
      if (!emp) return { vacaciones: [], permisos: [] };
      const [vacaciones, permisos] = await Promise.all([
        this.service.findVacationsByEmployee(emp.id),
        this.service.findPermissionsByEmployee(emp.id),
      ]);
      return { vacaciones, permisos };
    });
  }

  @Post('portal/vacation-request')
  portalVacationRequest(@Body() body: any, @Request() req?: any) {
    const userId = req?.user?.id;
    const tenantId = req?.user?.tenantId;
    return this.service.findEmployeeByUserId(userId).then((emp) => {
      if (!emp) throw new Error('Empleado no encontrado');
      return this.service.createVacationRequest({ ...body, employeeId: emp.id, tenantId });
    });
  }

  @Post('portal/permission-request')
  portalPermissionRequest(@Body() body: any, @Request() req?: any) {
    const userId = req?.user?.id;
    const tenantId = req?.user?.tenantId;
    return this.service.findEmployeeByUserId(userId).then((emp) => {
      if (!emp) throw new Error('Empleado no encontrado');
      return this.service.createPermissionRequest({ ...body, employeeId: emp.id, tenantId });
    });
  }

  @Get('portal/attendance-today')
  portalAttendanceToday(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.findEmployeeByUserId(userId).then((emp) => {
      if (!emp) return null;
      return this.service.findTodayAttendanceByEmployee(emp.id);
    });
  }

  @Post('portal/check-in')
  portalCheckIn(@Body() body: any, @Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.portalCheckIn(userId, body.lat, body.lng, body.method);
  }

  @Post('portal/check-out')
  portalCheckOut(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.portalCheckOut(userId);
  }
}
