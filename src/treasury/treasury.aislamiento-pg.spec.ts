import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { TreasuryService } from './treasury.service';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { PaymentSchedule } from './entities/payment-schedule.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Shift } from '../pos/entities/shift.entity';
import { Transfer } from '../transfers/entities/transfer.entity';

dotenv.config();

// Aislamiento entre tenants de Tesoreria contra Postgres real (esquema temporal que se borra al final).
// Tenant A tiene cuentas, movimientos y una transferencia pendiente; tenant B (el "gimnasio") no tiene cuentas.
// Antes del arreglo: con accountIds vacio el filtro se omitia y B veia los datos de A; ademas
// createQueryBuilder().andWhere().where() descartaba el filtro de cuentas. Si no hay Postgres local la suite falla a proposito.
describe('TreasuryService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_treasury_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: TreasuryService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, brA: string, bankA: string;

  const base = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'estia',
  });

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [Bank, Movement, PaymentSchedule, Purchase, Supplier, Company, Branch, Shift, Transfer],
    }).initialize();

    const co = await ds.getRepository(Company).save(ds.getRepository(Company).create({ tenantId: tA, tradeName: 'Empresa A' } as any) as any);
    coA = (co as any).id;
    const br = await ds.getRepository(Branch).save(ds.getRepository(Branch).create({ companyId: coA, name: 'Matriz A' } as any) as any);
    brA = (br as any).id;
    const bk = await ds.getRepository(Bank).save(ds.getRepository(Bank).create({ branchId: brA, tenantId: tA, name: 'BBVA A', balance: 1000, isActive: true } as any) as any);
    bankA = (bk as any).id;

    const ayer = new Date(Date.now() - 3 * 86400000);
    await ds.getRepository(Movement).save([
      { accountId: bankA, type: 'EXPENSE', concept: 'Renta A', amount: 500, category: 'RENT', createdAt: ayer },
      { accountId: bankA, type: 'INCOME', concept: 'Venta A', amount: 900, category: 'VENTAS', createdAt: ayer },
    ] as any);
    await ds.getRepository(Transfer).save({
      tenantId: tA, fromAccountId: bankA, amount: 25000, concept: 'Prestamo A', tipo: 'INTERCOMPAÑIA', status: 'PENDIENTE', empresaOrigenId: coA,
    } as any);
    await ds.getRepository(PaymentSchedule).save({
      concepto: 'Pago programado A', monto: 10, cuentaOrigenId: bankA, fechaProgramada: new Date(), tenantId: tA, branchId: brA,
    } as any);
    await ds.getRepository(Purchase).save({ tenantId: tA, numero: 'C-A', status: 'PENDIENTE', total: 100, montoPagado: 0 } as any);

    svc = new TreasuryService(
      ds.getRepository(Bank), ds.getRepository(Movement), ds.getRepository(PaymentSchedule),
      ds.getRepository(Purchase), ds.getRepository(Shift), ds.getRepository(Transfer),
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: el tenant A si ve sus propios datos (el filtro no es un "todo vacio")', async () => {
    const a = await svc.getAlerts(tA);
    expect(a.overdueAlerts).toEqual([]); // el egreso pasado «Renta A» ya no es una factura vencida; la compra C-A no tiene fecha de vencimiento (ver treasury.vencidas-reales-pg.spec.ts)
    expect(a.pendingAlerts.map((x) => x.concept)).toEqual(['Prestamo A']);
    expect((await svc.getExecutiveSummary(tA)).totalBalance).toBe(1000);
    expect((await svc.getBankPosition(tA)).accounts.map((x) => x.name)).toEqual(['BBVA A']);
    expect((await svc.getCashFlowForecast(7, tA)).currentBalance).toBe(1000);
  });

  it('getAlerts: tenant sin cuentas no ve egresos ni transferencias ajenas', async () => {
    const b = await svc.getAlerts(tB);
    expect(b.overdueAlerts).toEqual([]);
    expect(b.upcomingAlerts).toEqual([]);
    expect(b.pendingAlerts).toEqual([]);
    expect(b.lowBalanceAccounts).toEqual([]);
    expect(b.totalAlerts).toBe(0);
  });

  it('getExecutiveSummary / getCashFlowForecast / getBankPosition: ceros para el tenant sin cuentas', async () => {
    const s = await svc.getExecutiveSummary(tB);
    expect(s.totalBalance).toBe(0);
    expect(s.monthlyFlow).toEqual({ income: 0, expense: 0, net: 0 });
    expect(s.topAccounts).toEqual([]);
    const f = await svc.getCashFlowForecast(7, tB);
    expect(f.currentBalance).toBe(0);
    expect(f.avgDailyIncome).toBe(0);
    expect(f.avgDailyExpense).toBe(0);
    const p = await svc.getBankPosition(tB);
    expect(p.accounts).toEqual([]);
    expect(p.totalBalance).toBe(0);
  });

  it('sin tenantId en el token: vacio, nunca "sin filtro"', async () => {
    const a = await svc.getAlerts(undefined);
    expect(a.totalAlerts).toBe(0);
    expect((await svc.getExecutiveSummary(undefined)).totalBalance).toBe(0);
    expect((await svc.getBankPosition(undefined)).accounts).toEqual([]);
    expect((await svc.getAccountsReceivable(undefined))).toEqual([]);
    expect((await svc.getAccountsPayable(undefined))).toEqual([]);
    expect((await svc.getScheduledPayments(undefined))).toEqual([]);
  });

  it('cabeceras X-Company-Id / X-Branch-Id de otro tenant no abren datos ajenos', async () => {
    // El tenant B manda las cabeceras de la empresa/sucursal de A
    expect((await svc.getAlerts(tB, brA, coA)).totalAlerts).toBe(0);
    expect((await svc.getExecutiveSummary(tB, brA, coA)).totalBalance).toBe(0);
    expect((await svc.getBankPosition(tB, undefined, coA)).accounts).toEqual([]);
    expect((await svc.getCashFlowForecast(7, tB, brA)).currentBalance).toBe(0);
    expect(await svc.getAccountsReceivable(tB, brA, coA)).toEqual([]);
    expect(await svc.getAccountsPayable(tB, brA, coA)).toEqual([]);
    expect(await svc.getScheduledPayments(tB, brA, coA)).toEqual([]);
  });

  it('CxC / CxP / pagos programados: tenant sin cuentas no ve nada y A conserva lo suyo', async () => {
    expect(await svc.getAccountsReceivable(tB)).toEqual([]);
    expect(await svc.getAccountsPayable(tB)).toEqual([]);
    expect(await svc.getScheduledPayments(tB)).toEqual([]);
    expect((await svc.getAccountsReceivable(tA)).map((x) => x.concepto)).toEqual(['Venta A']);
    expect((await svc.getAccountsPayable(tA)).map((x) => x.numero)).toEqual(['C-A']);
    expect((await svc.getScheduledPayments(tA)).map((x) => x.concepto)).toEqual(['Pago programado A']);
  });

  it('el filtro por cuentas se conserva (where() ya no pisa al andWhere): una cuenta de B no suma al saldo de A', async () => {
    const coB = await ds.getRepository(Company).save(ds.getRepository(Company).create({ tenantId: tB, tradeName: 'Empresa B' } as any) as any);
    const brB = await ds.getRepository(Branch).save(ds.getRepository(Branch).create({ companyId: (coB as any).id, name: 'Matriz B' } as any) as any);
    await ds.getRepository(Bank).save(ds.getRepository(Bank).create({ branchId: (brB as any).id, tenantId: tB, name: 'HSBC B', balance: 777, isActive: true } as any) as any);
    expect((await svc.getExecutiveSummary(tA)).totalBalance).toBe(1000);
    expect((await svc.getExecutiveSummary(tB)).totalBalance).toBe(777);
    expect((await svc.getBankPosition(tA)).accounts.map((x) => x.name)).toEqual(['BBVA A']);
    // y la alerta de B sigue sin ver los egresos/transferencias de A aunque ahora si tenga cuenta
    const b = await svc.getAlerts(tB);
    expect(b.overdueAlerts).toEqual([]);
    expect(b.pendingAlerts).toEqual([]);
  });
});
