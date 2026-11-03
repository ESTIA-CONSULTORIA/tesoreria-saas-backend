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

// «Facturas vencidas» de Tesoreria: antes eran CUALQUIER egreso pasado (limite 10, "simulado" en el codigo) y los «dias» eran
// los transcurridos desde que se registro el movimiento. Ahora salen de las cuentas por pagar reales (compras PENDIENTE/PARCIAL
// con fecha de vencimiento ya pasada), con el saldo pendiente y los dias desde su vencimiento. Postgres real, dos tenants.
describe('Tesoreria: facturas vencidas = cuentas por pagar reales (Postgres real)', () => {
  const schema = `test_vencidas_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: TreasuryService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  const tSinCxP = '33333333-3333-4333-8333-333333333333';
  let coA: string, coB: string;

  const base = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'estia',
  });
  // Fecha LOCAL (dia de negocio), igual que el servicio: con UTC el spec fallaria de noche en Mexico.
  const dia = (delta: number) => {
    const f = new Date(Date.now() + delta * 86400000);
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  };

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [Bank, Movement, PaymentSchedule, Purchase, Supplier, Company, Branch, Shift, Transfer],
    }).initialize();

    const mkTenant = async (tenantId: string, nombre: string) => {
      const co: any = await ds.getRepository(Company).save(ds.getRepository(Company).create({ tenantId, tradeName: `Empresa ${nombre}` } as any) as any);
      const br: any = await ds.getRepository(Branch).save(ds.getRepository(Branch).create({ companyId: co.id, name: `Matriz ${nombre}` } as any) as any);
      const bk: any = await ds.getRepository(Bank).save(ds.getRepository(Bank).create({ branchId: br.id, tenantId, name: `Banco ${nombre}`, balance: 1000, isActive: true } as any) as any);
      return { co: co.id as string, bank: bk.id as string };
    };
    const a = await mkTenant(tA, 'A');
    const b = await mkTenant(tB, 'B');
    const d = await mkTenant(tSinCxP, 'D');
    coA = a.co; coB = b.co;

    const provA: any = await ds.getRepository(Supplier).save({ nombre: 'Proveedor A', tenantId: tA } as any);
    const provB: any = await ds.getRepository(Supplier).save({ nombre: 'Proveedor B', tenantId: tB } as any);

    const compra = (extra: any) => ds.getRepository(Purchase).save({ status: 'PENDIENTE', total: 100, montoPagado: 0, ...extra } as any);
    // Tenant A: dos vencidas reales, y cuatro que NO deben salir
    await compra({ tenantId: tA, companyId: coA, numero: 'FA-VENCIDA', supplierId: provA.id, total: 100, fechaVencimiento: dia(-10) });
    await compra({ tenantId: tA, companyId: coA, numero: 'FA-PARCIAL', supplierId: provA.id, status: 'PARCIAL', total: 200, montoPagado: 50, fechaVencimiento: dia(-3) });
    await compra({ tenantId: tA, companyId: coA, numero: 'FA-VIGENTE', supplierId: provA.id, fechaVencimiento: dia(5) });
    await compra({ tenantId: tA, companyId: coA, numero: 'FA-SIN-FECHA', supplierId: provA.id, fechaVencimiento: null });
    await compra({ tenantId: tA, companyId: coA, numero: 'FA-PAGADA', supplierId: provA.id, status: 'PAGADA', montoPagado: 100, fechaVencimiento: dia(-20) });
    await compra({ tenantId: tA, companyId: coA, numero: 'FA-CANCELADA', supplierId: provA.id, status: 'CANCELADA', fechaVencimiento: dia(-20) });
    // Tenant B: una vencida propia
    await compra({ tenantId: tB, companyId: coB, numero: 'FB-VENCIDA', supplierId: provB.id, total: 777, fechaVencimiento: dia(-1) });

    // Egresos pasados en las cuentas de A y D: antes se mostraban como «facturas vencidas»; ya no
    for (const [bank, concepto] of [[a.bank, 'Renta A (egreso)'], [d.bank, 'Gasto D (egreso)']]) {
      await ds.getRepository(Movement).save({ accountId: bank, type: 'EXPENSE', concept: concepto, amount: 500, category: 'RENT', createdAt: new Date(Date.now() - 3 * 86400000) } as any);
    }

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

  it('A ve solo sus cuentas por pagar vencidas (PENDIENTE/PARCIAL con fecha pasada), la mas antigua primero', async () => {
    const r = await svc.getAlerts(tA);
    expect(r.overdueAlerts.map((x) => x.concept)).toEqual(['FA-VENCIDA · Proveedor A', 'FA-PARCIAL · Proveedor A']);
  });

  it('el monto es el saldo pendiente (total - pagado) y la fecha es la de vencimiento, no la de registro', async () => {
    const r = await svc.getAlerts(tA);
    expect(r.overdueAlerts.map((x) => x.amount)).toEqual([100, 150]);
    expect(r.overdueAlerts.map((x) => String(x.date).slice(0, 10))).toEqual([dia(-10), dia(-3)]);
  });

  it('un egreso pasado ya no cuenta como factura vencida', async () => {
    const r = await svc.getAlerts(tA);
    expect(JSON.stringify(r.overdueAlerts)).not.toContain('Renta A');
  });

  it('estado vacio honesto: un negocio con cuentas y egresos pero sin cuentas por pagar vencidas no ve nada', async () => {
    const r = await svc.getAlerts(tSinCxP);
    expect(r.overdueAlerts).toEqual([]);
  });

  it('aislamiento: B solo ve la suya; ni A ve la de B ni B las de A', async () => {
    expect((await svc.getAlerts(tB)).overdueAlerts.map((x) => x.concept)).toEqual(['FB-VENCIDA · Proveedor B']);
    expect(JSON.stringify((await svc.getAlerts(tA)).overdueAlerts)).not.toContain('FB-');
  });

  it('la cabecera de empresa solo estrecha dentro del tenant: B con la empresa de A no ve nada, A con su empresa ve lo suyo', async () => {
    expect((await svc.getAlerts(tB, undefined, coA)).overdueAlerts).toEqual([]);
    expect((await svc.getAlerts(tA, undefined, coA)).overdueAlerts).toHaveLength(2);
    expect((await svc.getAlerts(tA, undefined, coB)).overdueAlerts).toEqual([]);
  });

  it('sin tenant en el token: vacio, nunca todo', async () => {
    expect((await svc.getAlerts(undefined)).overdueAlerts).toEqual([]);
  });

  it('el conteo total de alertas incluye solo las vencidas reales', async () => {
    const r = await svc.getAlerts(tA);
    expect(r.totalAlerts).toBe(r.lowBalanceAccounts.length + r.overdueAlerts.length + r.upcomingAlerts.length + r.pendingAlerts.length);
  });
});
