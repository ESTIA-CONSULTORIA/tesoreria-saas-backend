import { tenantDeSesion, tenantParaListar, tenantParaEscribir } from '../auth/tenant-access.util';
import { sucursalEfectiva } from '../common/sucursal-efectiva';
import { parseFiltrosSolicitudes } from './pending-requests.query';
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Request } from '@nestjs/common';
import { HrService } from './hr.service';
import { Modulo } from '../auth/modulo.decorator';

// Auditoría de seguridad (GoodsHabits, P1): sin @Modulo() un tenant sin el addon RH
// ($300, catálogo modules.code='rh') podía llamar /hr/* directo y obtener empleados,
// asistencia, nómina y expedientes igual. 'rh' es el único código del catálogo que cubre
// todo RH — no existen 'nomina'/'contratos' como códigos separados (confirmado contra
// MODULES_CATALOG en seed.ts), por eso payroll.controller.ts y contracts.controller.ts
// usan el mismo código, no uno propio.
@Modulo('rh')
@Controller('hr')
export class HrController {
  constructor(private readonly service: HrService) {}

  // Employees
  @Get('employees')
  findAll(
    @Query('tenantId') tenantIdQuery?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    // Tenant del token; SOPORTE solo con ?tenantId= explícito. X-Tenant-Id ya no se lee. La empresa se valida en el servicio.
    const tenantId = tenantParaListar(req, tenantIdQuery);
    const companyId = req?.user?.companyId ?? headerCompanyId;
    return this.service.findAllEmployees(tenantId, companyId);
  }

  @Post('employees')
  create(
    @Body() body: any,
    @Query('tenantId') tenantIdQuery?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const tenantId = tenantParaEscribir(req, tenantIdQuery);
    const companyId = req?.user?.companyId ?? headerCompanyId;
    return this.service.createEmployee({ ...body, tenantId, companyId });
  }

  @Put('employees/:id')
  update(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.updateEmployee(id, body, tenantId);
  }

  @Delete('employees/:id')
  remove(@Param('id') id: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.removeEmployee(id, tenantId);
  }

  // Static sub-routes — must be before :employeeId routes
  @Get('employees/photos')
  getPhotos(@Query('employeeIds') employeeIds: string, @Query('tenantId') tenantIdQuery?: string, @Request() req?: any) {
    const ids = employeeIds ? employeeIds.split(',').filter(Boolean) : [];
    return this.service.getEmployeePhotos(ids, tenantParaListar(req, tenantIdQuery));
  }

  @Get('employees/birthdays')
  getBirthdays(@Query('tenantId') tenantIdQuery?: string, @Request() req?: any) {
    return this.service.getBirthdaysThisMonth(tenantParaListar(req, tenantIdQuery));
  }

  // Documents
  @Get('employees/:employeeId/documents')
  getDocuments(@Param('employeeId') employeeId: string, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.findDocsByEmployee(employeeId, tenantId);
  }

  @Post('employees/:employeeId/documents')
  addDocument(@Param('employeeId') employeeId: string, @Body() body: any, @Request() req?: any) {
    return this.service.addDocument(employeeId, body, tenantDeSesion(req));
  }

  @Delete('documents/:id')
  removeDocument(@Param('id') id: string, @Request() req?: any) {
    return this.service.removeDocument(id, tenantDeSesion(req));
  }

  @Post('employees/:employeeId/documents/ocr')
  ocrDocument(
    @Param('employeeId') employeeId: string,
    @Body() body: { fileData: string; tipo: string },
    @Request() req?: any,
  ) {
    return this.service.ocrDocument(employeeId, body.fileData, body.tipo, tenantDeSesion(req));
  }

  @Post('employees/:employeeId/documents/ocr/:documentId/confirm')
  confirmOcr(
    @Param('employeeId') employeeId: string,
    @Param('documentId') documentId: string,
    @Body() body: { fields: Record<string, string> },
    @Request() req?: any,
  ) {
    return this.service.confirmOcr(employeeId, documentId, body.fields, tenantDeSesion(req));
  }

  // Shifts (HR turnos, not POS)
  @Get('shifts')
  findShifts(@Query('tenantId') tenantIdQuery?: string, @Request() req?: any) {
    return this.service.findAllShifts(tenantParaListar(req, tenantIdQuery));
  }

  @Post('shifts')
  createShift(@Body() body: any, @Query('tenantId') tenantIdQuery?: string, @Request() req?: any) {
    const tenantId = tenantParaEscribir(req, tenantIdQuery);
    return this.service.createShift({ ...body, tenantId });
  }

  @Put('shifts/:id')
  updateShift(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    return this.service.updateShift(id, body, tenantDeSesion(req));
  }

  @Delete('shifts/:id')
  deleteShift(@Param('id') id: string, @Request() req?: any) {
    return this.service.deleteShift(id, tenantDeSesion(req));
  }

  // Pending requests (admin view)
  @Get('requests/pending')
  getPending(@Query() query: Record<string, string>, @Request() req?: any) {
    const tenantId = tenantParaListar(req, query?.tenantId); // del token; SOPORTE solo con ?tenantId= explícito
    return this.service.findPendingRequests(tenantId, parseFiltrosSolicitudes(query));
  }

  // Vacation requests
  @Post('requests/vacation')
  createVacation(@Body() body: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.createVacationRequest({ ...body }, tenantId);
  }

  @Put('requests/vacation/:id/approve')
  approveVacation(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.approveVacation(id, approvedBy, body.responseNote, tenantDeSesion(req));
  }

  @Put('requests/vacation/:id/reject')
  rejectVacation(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.rejectVacation(id, approvedBy, body.responseNote, tenantDeSesion(req));
  }

  // Permission requests
  @Post('requests/permission')
  createPermission(@Body() body: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.createPermissionRequest({ ...body }, tenantId);
  }

  @Put('requests/permission/:id/approve')
  approvePermission(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.approvePermission(id, approvedBy, body.responseNote, tenantDeSesion(req));
  }

  @Put('requests/permission/:id/reject')
  rejectPermission(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    const approvedBy = req?.user?.id;
    return this.service.rejectPermission(id, approvedBy, body.responseNote, tenantDeSesion(req));
  }

  // Attendance
  @Post('attendance')
  createManualAttendance(@Body() body: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.createManualAttendance({ ...body, tenantId }); // el servicio toma el tenant del empleado y exige que sea del token
  }

  @Get('attendance/today')
  getAttendanceToday(@Headers('x-branch-id') branchId?: string, @Query('tenantId') tenantIdQuery?: string, @Request() req?: any) {
    // Sin tenant nunca se listan todos; la sucursal del token manda y el header solo estrecha dentro del tenant
    const bid = sucursalEfectiva(req?.user, branchId).branchId;
    return this.service.findAttendanceToday(bid, tenantParaListar(req, tenantIdQuery));
  }

  @Get('attendance/employee/:employeeId')
  getAttendanceByEmployee(
    @Param('employeeId') employeeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Request() req?: any,
  ) {
    return this.service.findAttendanceByEmployee(
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      tenantDeSesion(req),
    );
  }

  @Post('attendance/check-in')
  checkIn(@Body() body: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    const branchId = req?.user?.branchId || body.branchId;
    const employeeId = body.employeeId || req?.user?.employeeId;
    return this.service.checkIn(employeeId, tenantId, branchId, body.method, body.lat, body.lng);
  }

  @Post('attendance/check-out')
  checkOut(@Body() body: any, @Request() req?: any) {
    const employeeId = body.employeeId || req?.user?.employeeId;
    return this.service.checkOut(employeeId, tenantDeSesion(req));
  }

  @Post('attendance/upsert')
  upsertAttendance(@Body() body: any, @Request() req?: any) {
    // El tenant sale del empleado (que debe ser del token); X-Tenant-Id ya no se lee. La sucursal se valida en el servicio.
    // changedBy/approvedBy salen del token: el body no puede atribuir el cambio a otra persona.
    const branchId = req?.user?.branchId || req?.headers?.['x-branch-id'];
    const changedBy = req?.user?.id;
    const approvedBy = body?.approvedBy ? req?.user?.id : undefined;
    return this.service.upsertAttendance({ ...body, branchId, changedBy, approvedBy }, tenantDeSesion(req));
  }

  @Patch('attendance/:id')
  updateAttendance(@Param('id') id: string, @Body() body: any, @Request() req?: any) {
    return this.service.updateAttendance(id, body, tenantDeSesion(req));
  }

  @Get('attendance/:employeeId/audit')
  getAttendanceAudit(
    @Param('employeeId') employeeId: string,
    @Request() req: any,
  ) {
    return this.service.getAttendanceAudit(employeeId, tenantDeSesion(req));
  }

  @Post('attendance/audit/:auditId/revert')
  revertAttendanceChange(
    @Param('auditId') auditId: string,
    @Body() body: { revertedBy?: string },
    @Request() req?: any,
  ) {
    // revertedBy sale del token, no del body
    return this.service.revertAttendanceChange(auditId, req?.user?.id, tenantDeSesion(req));
  }

  // Biometrics
  @Post('biometrics/face/register')
  registerFace(@Body() body: any, @Request() req?: any) {
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.registerFace(body.employeeId, tenantId, body.faceDescriptor);
  }

  @Post('biometrics/face/verify')
  verifyFace(@Body() body: any, @Request() req?: any, @Query('tenantId') tenantIdQuery?: string) {
    // body.tenantId ya no se lee: tenant del token; SOPORTE con ?tenantId= explícito
    return this.service.verifyFace(body.faceDescriptor, tenantParaListar(req, tenantIdQuery));
  }

  @Get('biometrics')
  getBiometrics(@Query('tenantId') tenantIdQuery?: string, @Request() req?: any) {
    return this.service.findBiometricsByTenant(tenantParaListar(req, tenantIdQuery));
  }

  // Portal portal empleado
  @Get('portal/me')
  getPortalMe(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.getPortalProfile(userId);
  }

  @Get('portal/attendance-recent')
  getPortalAttendanceRecent(@Request() req?: any) {
    const userId = req?.user?.id;
    return this.service.getRecentAttendanceForUser(userId);
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
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.findEmployeeByUserId(userId).then((emp) => {
      if (!emp) throw new Error('Empleado no encontrado');
      return this.service.createVacationRequest({ ...body, employeeId: emp.id }, emp.tenantId);
    });
  }

  @Post('portal/permission-request')
  portalPermissionRequest(@Body() body: any, @Request() req?: any) {
    const userId = req?.user?.id;
    const tenantId = tenantDeSesion(req) as string; // undefined = SOPORTE (sin acotar)
    return this.service.findEmployeeByUserId(userId).then((emp) => {
      if (!emp) throw new Error('Empleado no encontrado');
      return this.service.createPermissionRequest({ ...body, employeeId: emp.id }, emp.tenantId);
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
