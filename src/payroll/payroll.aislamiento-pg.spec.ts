import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PayrollRun } from './entities/payroll-run.entity';
import { PayrollEntry } from './entities/payroll-entry.entity';
import { PayrollConceptTemplate } from './entities/payroll-concept-template.entity';
import { EmployeeIncapacity } from './entities/employee-incapacity.entity';
import { Employee } from '../hr/entities/employee.entity';
import { Attendance } from '../hr/entities/attendance.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';

dotenv.config();

// Nomina contra Postgres real (esquema temporal). Antes: ~15 rutas operaban solo por id (ver la corrida, el archivo de
// dispersion con CLABE y RFC, recibos, aprobar, confirmar pago contra CUALQUIER cuenta bancaria, borrar/editar conceptos
// incluso globales), una corrida con la sucursal de otro negocio metia sus empleados y sueldos en TU nomina, y x-tenant-id
// (cabecera del cliente) decidia el negocio.
describe('PayrollService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_payroll_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: PayrollService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, brA: string, coB: string, brB: string, empA: string, bankA: string, bankB: string;
  let runA: string, entryA: string, conceptA: string, conceptGlobal: string;

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
  const noEncontrado = (p: Promise<any>) => expect(p).rejects.toBeInstanceOf(NotFoundException);

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    // El servicio usa SQL crudo sin esquema: el search_path apunta al esquema temporal (y a public por uuid-ossp / gen_random_uuid)
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [PayrollRun, PayrollEntry, PayrollConceptTemplate, EmployeeIncapacity, Employee, Attendance, Company, Branch, Bank, Movement],
      extra: { options: `-c search_path=${schema},public` },
    }).initialize();
    // El esquema de prueba replica produccion: movement NO tiene columna "tenantId" (comprobado en produccion). confirmPayment
    // la incluia en su INSERT y fallaba; este spec cubre esa regresion.

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' });
    brA = await guardar(Branch, { companyId: coA, name: 'Matriz A' });
    brB = await guardar(Branch, { companyId: coB, name: 'Matriz B' });
    empA = await guardar(Employee, { tenantId: tA, companyId: coA, branchId: brA, nombre: 'Ana', status: 'ACTIVO', salarioDiarioIntegrado: 500, clabe: '012345678901234567', banco: 'BBVA', rfc: 'RFCA010101AAA' });
    await guardar(Employee, { tenantId: tB, companyId: coB, branchId: brB, nombre: 'Beto', status: 'ACTIVO', salarioDiarioIntegrado: 300 });
    bankA = await guardar(Bank, { branchId: brA, tenantId: tA, name: 'Banco A', balance: 0, isActive: true });
    bankB = await guardar(Bank, { branchId: brB, tenantId: tB, name: 'Banco B', balance: 0, isActive: true });
    runA = await guardar(PayrollRun, { tenantId: tA, companyId: coA, branchId: brA, periodStart: '2026-10-01', periodEnd: '2026-10-15', status: 'APROBADA', totalAmount: 5000 });
    entryA = await guardar(PayrollEntry, { payrollRunId: runA, employeeId: empA, tenantId: tA, workedDays: 10, dailySalary: 500, netAmount: 5000, status: 'REVISADO', concepts: [] });
    conceptA = await guardar(PayrollConceptTemplate, { tenantId: tA, companyId: coA, name: 'Bono A', type: 'P', defaultAmount: 100, isGlobal: false, isActive: true });
    conceptGlobal = await guardar(PayrollConceptTemplate, { tenantId: 'GLOBAL', name: 'ISR', type: 'D', defaultAmount: 0, isGlobal: true, isActive: true });

    const storage: any = { upload: async () => undefined, getOneByOwner: async () => null };
    svc = new PayrollService(
      ds.getRepository(PayrollRun), ds.getRepository(PayrollEntry), ds.getRepository(PayrollConceptTemplate),
      ds.getRepository(EmployeeIncapacity), ds, storage,
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve y opera lo suyo (corridas, archivo de dispersion, catalogo, conceptos)', async () => {
    expect((await svc.listPayrollRuns(tA)).length).toBe(1);
    expect((await svc.getPayrollRun(runA, tA)).entries.length).toBe(1);
    expect((await svc.generateLayoutFile(runA, 'GENERIC', tA)).content).toContain('012345678901234567');
    expect((await svc.getCatalog(tA, coA)).map((c) => c.name).sort()).toEqual(['Bono A', 'ISR']);
  });

  it('listados: B y "sin tenant" no ven corridas ni conceptos de A; la empresa ajena (X-Company-Id) tampoco', async () => {
    for (const t of [tB, undefined]) {
      expect(await svc.listPayrollRuns(t)).toEqual([]);
      expect(await svc.getConceptTemplates(empA, t)).toEqual([]);
      expect(await svc.getIncapacities(empA, t)).toEqual([]);
    }
    expect(await svc.listPayrollRuns(tA, coB)).toEqual([]);
    expect((await svc.getCatalog(tB, coA)).map((c) => c.name)).toEqual(['ISR']); // solo el global
    expect((await svc.getCatalog(undefined, coA)).map((c) => c.name)).toEqual(['ISR']);
  });

  it('por id: B no ve, aprueba, paga, descarga CLABE/RFC ni genera recibos de la nomina de A (404)', async () => {
    await noEncontrado(svc.getPayrollRun(runA, tB));
    await noEncontrado(svc.approvePayrollRun(runA, 'x', tB));
    await noEncontrado(svc.updatePayrollEntry(entryA, [{ name: 'x', type: 'P', amount: 1 }], tB));
    await noEncontrado(svc.generateLayoutFile(runA, 'GENERIC', tB));
    await noEncontrado(svc.generateReceipts(runA, tB));
    await noEncontrado(svc.confirmPayment(runA, bankB, tB));
    await noEncontrado(svc.confirmPaymentPerEmployee(runA, bankB, tB));
    expect(await ds.getRepository(PayrollRun).findOneBy({ id: runA })).toMatchObject({ status: 'APROBADA' });
    expect(Number((await ds.getRepository(PayrollEntry).findOneBy({ id: entryA }))!.netAmount)).toBe(5000);
    expect(await ds.getRepository(Movement).count()).toBe(0);
    expect(await svc.isPeriodLocked(brA, '2026-10-05', tB)).toBe(false);
  });

  it('conceptos: B no edita ni borra los de A ni los globales; los globales no se borran (400)', async () => {
    await noEncontrado(svc.saveConceptTemplate({ id: conceptA, employeeId: empA, name: 'Hackeado', type: 'P', defaultAmount: 1 }, tB));
    await noEncontrado(svc.saveConceptTemplate({ id: conceptGlobal, employeeId: empA, name: 'Hackeado', type: 'P', defaultAmount: 1 }, tB));
    await noEncontrado(svc.saveConceptTemplate({ employeeId: empA, name: 'Nuevo', type: 'P', defaultAmount: 1 }, tB)); // empleado de A
    await noEncontrado(svc.deleteConceptTemplate(conceptA, tB));
    await noEncontrado(svc.deleteCatalogConcept(conceptA, tB));
    await noEncontrado(svc.saveCatalogConcept({ id: conceptA, tenantId: tB, companyId: coB, name: 'Hackeado', type: 'P', defaultAmount: 1 }));
    await expect(svc.deleteCatalogConcept(conceptGlobal, tB)).rejects.toBeInstanceOf(NotFoundException); // global de OTRO tenant ('GLOBAL')
    await expect(svc.deleteConceptTemplate(conceptGlobal, undefined)).rejects.toBeInstanceOf(BadRequestException); // SOPORTE tampoco borra globales
    expect(await ds.getRepository(PayrollConceptTemplate).findOneBy({ id: conceptA })).toMatchObject({ name: 'Bono A', isActive: true });
    await noEncontrado(svc.saveCatalogConcept({ tenantId: tB, companyId: coA, name: 'X', type: 'P', defaultAmount: 1 })); // empresa de A
  });

  it('crear nomina: sin tenant 400; sucursal o empresa de otro tenant 404 (antes entraban los sueldos de otro negocio)', async () => {
    const dto = { periodStart: '2026-11-01', periodEnd: '2026-11-15' };
    await expect(svc.createPayrollRun(dto, undefined as any, coB, brB)).rejects.toBeInstanceOf(BadRequestException);
    await noEncontrado(svc.createPayrollRun(dto, tB, coB, brA)); // sucursal de A
    await noEncontrado(svc.createPayrollRun(dto, tB, coA, brB)); // empresa de A
    expect(await ds.getRepository(PayrollRun).count({ where: { tenantId: tB } })).toBe(0);
    const ok = await svc.createPayrollRun(dto, tB, coB, brB);
    expect(ok.entries.length).toBe(1);
    expect(ok.entries.every((e) => e.employeeId !== empA && e.tenantId === tB)).toBe(true);
  });

  it('incapacidades: B no registra incapacidades de empleados de A', async () => {
    await noEncontrado(svc.createIncapacity({ employeeId: empA, startDate: '2026-10-01', endDate: '2026-10-02', days: 2, type: 'SIN_RIESGO' }, tB));
    expect(await ds.getRepository(EmployeeIncapacity).count()).toBe(0);
  });

  it('pago: A no puede registrar el egreso en la cuenta de B; con su cuenta si, y el periodo queda cerrado', async () => {
    await noEncontrado(svc.confirmPayment(runA, bankB, tA));
    expect(await ds.getRepository(Movement).count()).toBe(0);
    expect((await svc.confirmPayment(runA, bankA, tA)).status).toBe('PAGADA');
    expect(await ds.getRepository(Movement).count()).toBe(1);
    expect(await svc.isPeriodLocked(brA, '2026-10-05', tA)).toBe(true);
    expect(await svc.isPeriodLocked(brA, '2026-10-05', tB)).toBe(false);
  });

  it('pago por empleado: registra un movimiento por empleado en la cuenta del tenant (regresion: el INSERT usaba una columna inexistente)', async () => {
    const run2 = await guardar(PayrollRun, { tenantId: tA, companyId: coA, branchId: brA, periodStart: '2026-11-01', periodEnd: '2026-11-15', status: 'APROBADA', totalAmount: 100 });
    await guardar(PayrollEntry, { payrollRunId: run2, employeeId: empA, tenantId: tA, workedDays: 1, dailySalary: 100, netAmount: 100, status: 'REVISADO', concepts: [] });
    const antes = await ds.getRepository(Movement).count();
    await noEncontrado(svc.confirmPaymentPerEmployee(run2, bankB, tA)); // cuenta de otro tenant
    expect((await svc.confirmPaymentPerEmployee(run2, bankA, tA)).status).toBe('PAGADA');
    expect(await ds.getRepository(Movement).count()).toBe(antes + 1);
  });

  it('controlador: tenant del token (x-tenant-id y query ignorados), token sin tenant 403, aprobacion atribuida al token', async () => {
    const service: any = { listPayrollRuns: jest.fn(), createPayrollRun: jest.fn(), approvePayrollRun: jest.fn(), getPayrollRun: jest.fn() };
    const ctrl = new PayrollController(service);
    const admin = { user: { id: 'u1', email: 'admin@a.mx', roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB }, headers: { 'x-tenant-id': tB } };
    expect(() => ctrl.listPayrollRuns(undefined, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    ctrl.listPayrollRuns(undefined, admin);
    expect(service.listPayrollRuns.mock.calls[0][0]).toBe(tA);
    ctrl.listPayrollRuns(undefined, { user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(service.listPayrollRuns.mock.calls[1][0]).toBe(tB);
    expect(() => ctrl.createPayrollRun({ periodStart: 'a', periodEnd: 'b' } as any, undefined, { user: { roleCode: 'SOPORTE' }, query: {} })).toThrow(BadRequestException);
    ctrl.approvePayrollRun('run1', { approvedBy: 'otra-persona' }, admin);
    expect(service.approvePayrollRun).toHaveBeenCalledWith('run1', 'admin@a.mx', tA);
    ctrl.getPayrollRun('run1', admin);
    expect(service.getPayrollRun).toHaveBeenCalledWith('run1', tA);
    expect(() => ctrl.getPayrollRun('run1', { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
  });
});
