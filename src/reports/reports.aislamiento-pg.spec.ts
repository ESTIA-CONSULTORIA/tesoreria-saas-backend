import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Report } from './entities/report.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

dotenv.config();

// Reportes contra Postgres real (esquema temporal). Antes: con X-Company-Id (cabecera del cliente) se ignoraba el tenant
// y se reportaba la empresa de CUALQUIER tenant; y sin tenant ni empresa los reportes sumaban los movimientos de TODOS los tenants.
describe('ReportsService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_reports_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: ReportsService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, coB: string, bankA: string;

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
  const todos = (t?: string, c?: string) =>
    Promise.all([
      svc.cashFlow(undefined, undefined, t, c),
      svc.balanceByAccount(t, c),
      svc.categorySummary(undefined, undefined, t, c),
      svc.incomeStatement(undefined, undefined, t, c),
      svc.breakEvenPoint(undefined, undefined, t, c),
    ]);

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Report, Movement, Bank, Branch, Company] }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' }); // B tiene empresa pero NINGUNA cuenta
    const brA = await guardar(Branch, { companyId: coA, name: 'Matriz A' });
    bankA = await guardar(Bank, { branchId: brA, name: 'Banco A', balance: 5000, isActive: true });
    await guardar(Movement, { accountId: bankA, type: 'INCOME', category: 'VENTAS', concept: 'Venta A', amount: 1000, date: new Date() });
    await guardar(Movement, { accountId: bankA, type: 'EXPENSE', category: 'RENT', concept: 'Renta A', amount: 400, date: new Date() });

    svc = new ReportsService(
      ds.getRepository(Movement), ds.getRepository(Bank), ds.getRepository(Branch), ds.getRepository(Company), ds.getRepository(Report),
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve sus propios numeros', async () => {
    const cf = await svc.cashFlow(undefined, undefined, tA);
    expect(cf.totalIncome).toBe(1000);
    expect(cf.totalExpense).toBe(400);
    expect((await svc.balanceByAccount(tA)).map((b) => b.accountName)).toEqual(['Banco A']);
    expect((await svc.cashFlow(undefined, undefined, tA, coA)).totalIncome).toBe(1000);
  });

  it('"sin tenant": todos los reportes vacios, nunca la suma de todos los tenants', async () => {
    const vacios = await todos(undefined, undefined);
    expect(vacios[0]).toEqual({ weekly: [], totalIncome: 0, totalExpense: 0, totalNet: 0 });
    expect(vacios[1]).toEqual([]);
    expect(JSON.stringify(vacios)).not.toContain('Venta A');
    expect(JSON.stringify(vacios)).not.toContain('1000');
  });

  it('B (con empresa pero sin cuentas) ve lo mismo que "nada", incluso mandando la empresa de A en X-Company-Id', async () => {
    const vacios = await todos(undefined, undefined);
    expect(await todos(tB, undefined)).toEqual(vacios);
    expect(await todos(tB, coA)).toEqual(vacios); // antes: con companyId se ignoraba el tenant y salian los datos de A
    expect(await todos(tB, coB)).toEqual(vacios);
    expect(await todos(undefined, coA)).toEqual(vacios); // empresa sin tenant: tampoco
  });

  it('A no puede reportar la empresa de B (cabecera ajena): vacio', async () => {
    const vacios = await todos(undefined, undefined);
    expect(await todos(tA, coB)).toEqual(vacios);
  });

  it('controlador: el tenant sale del token (el query se ignora), SOPORTE usa ?tenantId=, token sin tenant 403', () => {
    const service: any = { cashFlow: jest.fn(), balanceByAccount: jest.fn() };
    const ctrl = new ReportsController(service);
    expect(() => ctrl.cashFlow({ user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    ctrl.cashFlow({ user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(service.cashFlow.mock.calls[0][2]).toBe(tA);
    ctrl.cashFlow({ user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(service.cashFlow.mock.calls[1][2]).toBe(tB);
    ctrl.balanceByAccount({ user: { roleCode: 'SOPORTE' }, query: {} });
    expect(service.balanceByAccount.mock.calls[0][0]).toBeUndefined();
  });
});
