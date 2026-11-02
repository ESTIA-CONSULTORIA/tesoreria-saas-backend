import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';
import { VacationRequest } from './entities/vacation-request.entity';
import { PermissionRequest } from './entities/permission-request.entity';
import { HrShift } from './entities/hr-shift.entity';
import { Attendance } from './entities/attendance.entity';
import { BiometricCredential } from './entities/biometric-credential.entity';
import { AttendanceAudit } from './entities/attendance-audit.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

dotenv.config();

// RH contra Postgres real (esquema temporal). Antes: ~25 rutas operaban solo por id (turnos, aprobar/rechazar
// solicitudes, documentos, asistencia, auditoria, OCR, fotos), los listados sin tenant devolvian todos los tenants
// y las cabeceras X-Tenant-Id / body.tenantId decidian el negocio.
describe('HrService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_hr_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: HrService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  const hoy = new Date().toISOString().slice(0, 10);
  let coA: string, brA: string, coB: string, empA: string, empB: string, docA: string, shiftA: string;
  let vacA: string, permA: string, attA: string, audA: string;

  const base = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'estia',
  });
  const guardar = async (entity: any, data: any): Promise<string> => {
    const r: any = await ds.getRepository(entity).save(ds.getRepository(entity).create(data) as any);
    return r.id;
  };

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [Employee, HrDocument, VacationRequest, PermissionRequest, HrShift, Attendance, BiometricCredential, AttendanceAudit, Branch, Company],
    }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' });
    brA = await guardar(Branch, { companyId: coA, name: 'Matriz A' });
    empA = await guardar(Employee, { tenantId: tA, companyId: coA, branchId: brA, nombre: 'Ana', status: 'ACTIVO' });
    empB = await guardar(Employee, { tenantId: tB, companyId: coB, nombre: 'Beto', status: 'ACTIVO' });
    docA = await guardar(HrDocument, { employeeId: empA, tipo: 'FOTO', nombre: 'foto' });
    shiftA = await guardar(HrShift, { tenantId: tA, name: 'Matutino', isActive: true });
    vacA = await guardar(VacationRequest, { tenantId: tA, employeeId: empA, startDate: '2026-12-01', endDate: '2026-12-02', status: 'PENDIENTE' });
    permA = await guardar(PermissionRequest, { tenantId: tA, employeeId: empA, date: '2026-12-05', type: 'PERSONAL', status: 'PENDIENTE' });
    attA = await guardar(Attendance, { tenantId: tA, employeeId: empA, branchId: brA, date: hoy, status: 'PRESENTE', method: 'WEB' });
    audA = await guardar(AttendanceAudit, { tenantId: tA, attendanceId: attA, employeeId: empA, date: hoy, changedBy: 'u1', newStatus: 'PRESENTE', reverted: false });
    await guardar(BiometricCredential, { tenantId: tA, employeeId: empA, type: 'FACE', faceDescriptor: '[1,2]', isActive: true });

    svc = new HrService(
      ds.getRepository(Employee), ds.getRepository(HrDocument), ds.getRepository(VacationRequest), ds.getRepository(PermissionRequest),
      ds.getRepository(HrShift), ds.getRepository(Attendance), ds.getRepository(BiometricCredential), ds.getRepository(AttendanceAudit),
      ds.getRepository(Branch), {} as any,
      { getContentByOwners: async () => new Map(), getOneByOwner: async () => null, upload: async () => undefined, deleteStoredFile: async () => undefined } as any,
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve lo suyo', async () => {
    expect((await svc.findAllEmployees(tA)).map((e) => e.nombre)).toEqual(['Ana']);
    expect((await svc.findAllShifts(tA)).length).toBe(1);
    expect((await svc.findPendingRequests(tA)).total).toBe(2);
    expect((await svc.findAttendanceToday(undefined, tA)).length).toBe(1);
    expect((await svc.findBiometricsByTenant(tA)).length).toBe(1);
  });

  it('listados: B (otro tenant) y "sin tenant" no ven nada de A; sin sucursal ya no devuelve todos los tenants', async () => {
    for (const t of [tB, undefined]) {
      // B tiene a su propio empleado ('Beto'): nunca a 'Ana' de A; sin tenant, nadie
      expect((await svc.findAllEmployees(t)).map((e) => e.nombre)).toEqual(t ? ['Beto'] : []);
      expect(await svc.findAllShifts(t)).toEqual([]);
      expect((await svc.findPendingRequests(t)).total).toBe(0);
      expect(await svc.findAttendanceToday(undefined, t)).toEqual([]);
      expect(await svc.findAttendanceToday(brA, t)).toEqual([]);
      expect(await svc.findBiometricsByTenant(t)).toEqual([]);
      expect(await svc.getBirthdaysThisMonth(t)).toEqual([]);
      expect(await svc.getEmployeePhotos([empA], t)).toEqual({});
      expect(await svc.verifyFace([1, 2], t)).toBeNull();
    }
    // fotos: B pidiendo el id de un empleado de A no obtiene nada, aunque A tenga foto
    expect(await svc.getEmployeePhotos([empA, empB], tB)).toEqual({});
  });

  it('X-Company-Id de otro tenant: sin resultados', async () => {
    expect(await svc.findAllEmployees(tA, coB)).toEqual([]);
    expect((await svc.findAllEmployees(tA, coA)).length).toBe(1);
  });

  it('por id: recursos de A tocados por B responden 404 y nada cambia', async () => {
    const notFound = (p: Promise<any>) => expect(p).rejects.toBeInstanceOf(NotFoundException);
    await notFound(svc.updateEmployee(empA, { nombre: 'Hackeado' }, tB));
    await notFound(svc.removeEmployee(empA, tB));
    await notFound(svc.findDocsByEmployee(empA, tB));
    await notFound(svc.addDocument(empA, { tipo: 'OTRO', nombre: 'x' }, tB));
    await notFound(svc.removeDocument(docA, tB));
    await notFound(svc.confirmOcr(empA, docA, { nombre: 'Hackeado' }, tB));
    await notFound(svc.updateShift(shiftA, { name: 'Hackeado' }, tB));
    await notFound(svc.deleteShift(shiftA, tB));
    await notFound(svc.approveVacation(vacA, 'x', 'ok', tB));
    await notFound(svc.rejectVacation(vacA, 'x', 'no', tB));
    await notFound(svc.approvePermission(permA, 'x', 'ok', tB));
    await notFound(svc.rejectPermission(permA, 'x', 'no', tB));
    await notFound(svc.checkOut(empA, tB));
    await notFound(svc.checkIn(empA, tB));
    await notFound(svc.updateAttendance(attA, { status: 'FALTA' }, tB));
    await notFound(svc.upsertAttendance({ employeeId: empA, date: hoy, status: 'FALTA', changedBy: 'x' }, tB));
    await notFound(svc.createManualAttendance({ employeeId: empA, date: hoy, tenantId: tB }));
    await notFound(svc.getAttendanceAudit(empA, tB));
    await notFound(svc.revertAttendanceChange(audA, 'x', tB));
    await notFound(svc.findAttendanceByEmployee(empA, undefined, undefined, tB));
    await notFound(svc.registerFace(empA, tB, [1]));
    await notFound(svc.createVacationRequest({ employeeId: empA, startDate: '2026-12-10' as any, endDate: '2026-12-11' as any }, tB));
    await notFound(svc.createPermissionRequest({ employeeId: empA, date: '2026-12-10' as any, type: 'X' as any }, tB));

    expect(await ds.getRepository(Employee).findOneBy({ id: empA })).toMatchObject({ nombre: 'Ana' });
    expect(await ds.getRepository(HrDocument).findOneBy({ id: docA })).not.toBeNull();
    expect(await ds.getRepository(HrShift).findOneBy({ id: shiftA })).toMatchObject({ name: 'Matutino', isActive: true });
    expect(await ds.getRepository(VacationRequest).findOneBy({ id: vacA })).toMatchObject({ status: 'PENDIENTE' });
    expect(await ds.getRepository(PermissionRequest).findOneBy({ id: permA })).toMatchObject({ status: 'PENDIENTE' });
    expect(await ds.getRepository(Attendance).findOneBy({ id: attA })).toMatchObject({ status: 'PRESENTE' });
    expect(await ds.getRepository(AttendanceAudit).findOneBy({ id: audA })).toMatchObject({ reverted: false });
    expect(await ds.getRepository(Attendance).count()).toBe(1);
  });

  it('altas: sin tenant 400, id del body no pisa, empresa/sucursal/turno ajenos 404', async () => {
    await expect(svc.createEmployee({ nombre: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createShift({ name: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
    const e: any = await svc.createEmployee({ id: empA, tenantId: tB, nombre: 'Otro', status: 'ACTIVO' } as any);
    expect(e.id).not.toBe(empA);
    expect(await ds.getRepository(Employee).findOneBy({ id: empA })).toMatchObject({ tenantId: tA, nombre: 'Ana' });
    await expect(svc.createEmployee({ tenantId: tB, nombre: 'Y', companyId: coA } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createEmployee({ tenantId: tB, nombre: 'Z', branchId: brA } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createShift({ tenantId: tB, name: 'T', branchId: brA } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.updateEmployee(empB, { shiftId: shiftA }, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.checkIn(empB, tB, brA)).rejects.toBeInstanceOf(NotFoundException); // sucursal de A
  });

  it('solicitud nueva de A: el tenant sale del empleado y status/approvedBy del body se descartan', async () => {
    const v: any = await svc.createVacationRequest(
      { employeeId: empA, tenantId: tB, status: 'APROBADA', approvedBy: 'yo', startDate: '2026-12-10' as any, endDate: '2026-12-12' as any } as any, tA);
    expect(v).toMatchObject({ tenantId: tA, status: 'PENDIENTE' });
    expect(v.approvedBy ?? null).toBeNull();
  });

  it('A sigue operando con lo suyo: aprobar vacaciones crea asistencia justificada, turno, auditoria y reversion', async () => {
    await svc.approveVacation(vacA, 'u-aprobador', 'ok', tA);
    expect(await ds.getRepository(VacationRequest).findOneBy({ id: vacA })).toMatchObject({ status: 'APROBADA', approvedBy: 'u-aprobador' });
    expect(await ds.getRepository(Attendance).count({ where: { tenantId: tA, status: 'JUSTIFICADO' } })).toBe(2);
    expect((await svc.updateShift(shiftA, { name: 'Vespertino' }, tA)).name).toBe('Vespertino');
    expect((await svc.getAttendanceAudit(empA, tA)).length).toBe(1);
    expect(await svc.revertAttendanceChange(audA, 'u-aprobador', tA)).toEqual({ reverted: true, auditId: audA });
  });

  it('controlador: revertedBy y approvedBy salen del token, X-Tenant-Id / body.tenantId se ignoran', async () => {
    const service: any = {
      revertAttendanceChange: jest.fn().mockResolvedValue({}),
      upsertAttendance: jest.fn().mockResolvedValue({}),
      findAllEmployees: jest.fn().mockResolvedValue([]),
      verifyFace: jest.fn().mockResolvedValue(null),
    };
    const ctrl = new HrController(service);
    const req = { user: { id: 'u-token', roleCode: 'ADMIN', tenantId: tA }, headers: { 'x-tenant-id': tB } };
    await ctrl.revertAttendanceChange('aud', { revertedBy: 'otra-persona' }, req);
    expect(service.revertAttendanceChange).toHaveBeenCalledWith('aud', 'u-token', tA);
    await ctrl.upsertAttendance({ employeeId: empA, date: hoy, status: 'FALTA', changedBy: 'otra', approvedBy: 'otro', tenantId: tB }, req);
    const [datos, tenant] = service.upsertAttendance.mock.calls[0];
    expect(datos).toMatchObject({ changedBy: 'u-token', approvedBy: 'u-token' });
    expect(tenant).toBe(tA);
    await ctrl.verifyFace({ faceDescriptor: [1], tenantId: tB }, req, tB);
    expect(service.verifyFace.mock.calls[0][1]).toBe(tA);
    // token sin tenant que no es SOPORTE: 403 en listados
    expect(() => ctrl.findAll(tB, undefined, { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
  });
});
