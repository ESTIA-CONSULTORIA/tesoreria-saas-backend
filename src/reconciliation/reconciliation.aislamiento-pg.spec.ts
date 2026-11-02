import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { Invoice, InvoiceStatus, InvoiceType, ReconciliationStatus } from './entities/invoice.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

dotenv.config();

// Conciliacion contra Postgres real (esquema temporal). Antes: GET /reconciliation/movements SIN bankAccountId devolvia
// los movimientos de TODOS los tenants (la consulta no tenia filtro), los listados sin tenant devolvian todo, y las
// cuentas de facturas nuevas/importadas no se validaban contra el tenant.
describe('ReconciliationService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_reconc_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: ReconciliationService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let bankA: string, bankB: string, movA: string, movB: string, invA: string;

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
  async function tenantConBanco(tenantId: string, nombre: string) {
    const co = await guardar(Company, { tenantId, tradeName: nombre });
    const br = await guardar(Branch, { companyId: co, name: nombre });
    // bank.tenantId se deja NULO a proposito: la pertenencia debe salir de la cadena sucursal -> empresa -> tenant
    return guardar(Bank, { branchId: br, name: `Banco ${nombre}`, balance: 0, isActive: true });
  }

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [Invoice, Movement, Bank, Branch, Company],
    }).initialize();

    bankA = await tenantConBanco(tA, 'A');
    bankB = await tenantConBanco(tB, 'B');
    movA = await guardar(Movement, { accountId: bankA, type: 'INCOME', concept: 'Venta A', amount: 100 });
    movB = await guardar(Movement, { accountId: bankB, type: 'INCOME', concept: 'Venta B', amount: 50 });
    invA = await guardar(Invoice, {
      tenantId: tA, invoiceNumber: 'F-A', type: InvoiceType.EMITIDA, status: InvoiceStatus.PENDIENTE_COBRO, amount: 100,
      dueDate: new Date(), bankAccountId: bankA, reconciliationStatus: ReconciliationStatus.PENDIENTE, needsManualReview: false,
    });

    svc = new ReconciliationService(
      ds.getRepository(Invoice), ds.getRepository(Movement), ds.getRepository(Bank), ds.getRepository(Branch), ds.getRepository(Company),
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve lo suyo (aunque bank.tenantId sea nulo)', async () => {
    expect((await svc.getAllInvoices(tA)).map((i) => i.invoiceNumber)).toEqual(['F-A']);
    expect((await svc.getAvailableMovements(undefined, tA)).map((m) => m.concept)).toEqual(['Venta A']);
    expect((await svc.getAvailableMovements(bankA, tA)).length).toBe(1);
    const d = await svc.getReconciliationData({ tenantId: tA });
    expect(d.notReconciled.map((m: any) => m.concept)).toEqual(['Venta A']);
    expect(d.pending.length).toBe(1);
    expect((await svc.getReconciliationSummary(tA)).total).toBe(1);
  });

  it('GET movements sin bankAccountId: cada tenant solo ve sus movimientos (antes devolvia los de todos)', async () => {
    expect((await svc.getAvailableMovements(undefined, tB)).map((m) => m.concept)).toEqual(['Venta B']);
    expect((await svc.getAvailableMovements(undefined, tA)).map((m) => m.concept)).toEqual(['Venta A']);
  });

  it('"sin tenant": todo vacio, nunca todos los tenants', async () => {
    expect(await svc.getAllInvoices(undefined)).toEqual([]);
    expect(await svc.getInvoicesByStatus(ReconciliationStatus.PENDIENTE, undefined)).toEqual([]);
    expect(await svc.getAvailableMovements(undefined, undefined)).toEqual([]);
    expect((await svc.getReconciliationSummary(undefined)).total).toBe(0);
    expect(await svc.getReconciliationData({})).toEqual({ reconciled: [], pending: [], notReconciled: [] });
  });

  it('B no ve facturas ni cuentas de A; pedir la cuenta de A es 404', async () => {
    expect(await svc.getAllInvoices(tB)).toEqual([]);
    expect(await svc.getInvoicesByStatus(ReconciliationStatus.PENDIENTE, tB)).toEqual([]);
    expect((await svc.getReconciliationSummary(tB)).total).toBe(0);
    await expect(svc.getAvailableMovements(bankA, tB)).rejects.toBeInstanceOf(NotFoundException);
    const d = await svc.getReconciliationData({ tenantId: tB, bankAccountId: bankA });
    expect(d).toEqual({ reconciled: [], pending: [], notReconciled: [] });
    const d2 = await svc.getReconciliationData({ tenantId: tB });
    expect(d2.notReconciled.map((m: any) => m.concept)).toEqual(['Venta B']);
    expect(JSON.stringify(d2)).not.toContain('Banco A');
  });

  it('por id: B no toca la factura de A y no puede conciliarla con su movimiento', async () => {
    await expect(svc.updateInvoiceStatus(invA, ReconciliationStatus.CONCILIADA, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.markForManualReview(invA, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteInvoice(invA, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.manualReconciliation(invA, movB, tB)).rejects.toBeInstanceOf(NotFoundException);
    // A tampoco puede conciliar su factura con un movimiento de B
    await expect(svc.manualReconciliation(invA, movB, tA)).rejects.toBeInstanceOf(NotFoundException);
    expect(await ds.getRepository(Invoice).findOneBy({ id: invA })).toMatchObject({
      reconciliationStatus: ReconciliationStatus.PENDIENTE, needsManualReview: false, movementId: null,
    });
    await expect(svc.updateInvoiceStatus(invA, 'INVENTADO' as any, tA)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('altas: sin tenant 400, id del body no pisa, cuenta de otro tenant 404 (alta e importacion)', async () => {
    const nueva = { invoiceNumber: 'F-N', type: InvoiceType.RECIBIDA, status: InvoiceStatus.PENDIENTE_PAGO, amount: 5, dueDate: new Date() };
    await expect(svc.createInvoice({ ...nueva })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.importInvoices([nueva], undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createInvoice({ ...nueva, tenantId: tB, bankAccountId: bankA })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.importInvoices([{ ...nueva, bankAccountId: bankA }], tB)).rejects.toBeInstanceOf(NotFoundException);
    const c: any = await svc.createInvoice({ ...nueva, id: invA, tenantId: tB, bankAccountId: bankB } as any);
    expect(c.id).not.toBe(invA);
    expect(await ds.getRepository(Invoice).findOneBy({ id: invA })).toMatchObject({ tenantId: tA, invoiceNumber: 'F-A' });
    expect((await svc.importInvoices([{ ...nueva, invoiceNumber: 'F-I', bankAccountId: bankB }], tB)).imported).toBe(1);
  });

  it('A concilia lo suyo: factura y movimiento del mismo tenant', async () => {
    const r: any = await svc.manualReconciliation(invA, movA, tA);
    expect(r).toMatchObject({ movementId: movA, reconciliationStatus: ReconciliationStatus.CONCILIADA });
    const d = await svc.getReconciliationData({ tenantId: tA });
    expect(d.reconciled.length).toBe(1);
  });

  it('controlador: token sin tenant que no es SOPORTE 403; SOPORTE con ?tenantId=; altas toman el tenant del token', async () => {
    const service: any = {
      getAllInvoices: jest.fn().mockResolvedValue([]),
      createInvoice: jest.fn().mockResolvedValue({}),
      deleteInvoice: jest.fn().mockResolvedValue({}),
    };
    const ctrl = new ReconciliationController(service);
    expect(() => ctrl.getAllInvoices({ user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
    ctrl.getAllInvoices({ user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(service.getAllInvoices.mock.calls[0][0]).toBe(tA);
    ctrl.getAllInvoices({ user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(service.getAllInvoices.mock.calls[1][0]).toBe(tB);
    ctrl.getAllInvoices({ user: { roleCode: 'SOPORTE' }, query: {} });
    expect(service.getAllInvoices.mock.calls[2][0]).toBeUndefined();
    ctrl.createInvoice({ invoiceNumber: 'x' } as any, { user: { roleCode: 'ADMIN', tenantId: tA }, query: {} });
    expect(service.createInvoice.mock.calls[0][0].tenantId).toBe(tA);
    expect(() => ctrl.createInvoice({ invoiceNumber: 'x' } as any, { user: { roleCode: 'SOPORTE' }, query: {} })).toThrow(BadRequestException);
    expect(() => ctrl.deleteInvoice('i', { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
  });
});
