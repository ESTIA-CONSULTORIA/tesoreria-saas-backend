import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { Transfer } from './entities/transfer.entity';
import { Bank } from '../banks/entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { AuditService } from '../audit/audit.service';
import { AuditController } from '../audit/audit.controller';
import { AuditLog } from '../audit/audit.entity';

dotenv.config();

// Transferencias y bitacora contra Postgres real (esquema temporal). Antes: GET /transfers sin tenant listaba las
// transferencias de todos los tenants, y GET /audit-logs con un token sin tenant que no es SOPORTE filtraba por un tenant
// indefinido (la condicion se omitia) y devolvia la bitacora completa de todos los negocios.
describe('Transferencias y bitacora: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_transfaudit_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let transfers: TransfersService;
  let audit: AuditController;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let transA: string;

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
  const resp = (data: any) => data?.data ?? data;

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Transfer, Bank, Movement, AuditLog] }).initialize();

    transA = await guardar(Transfer, { tenantId: tA, amount: 25000, concept: 'Prestamo A', tipo: 'INTERCOMPAÑIA', status: 'PENDIENTE' });
    await guardar(AuditLog, { tenantId: tA, userId: 'ua', userEmail: 'a@x.mx', roleCode: 'ADMIN', action: 'CREATE', entity: 'Movement', ipAddress: '127.0.0.1', userAgent: 'jest' });
    await guardar(AuditLog, { tenantId: tB, userId: 'ub', userEmail: 'b@x.mx', roleCode: 'ADMIN', action: 'CREATE', entity: 'Movement', ipAddress: '127.0.0.1', userAgent: 'jest' });

    transfers = new TransfersService(ds.getRepository(Transfer), ds.getRepository(Bank), ds);
    audit = new AuditController(new AuditService(ds.getRepository(AuditLog)));
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('transferencias: A ve las suyas; B y "sin tenant" no ven la de A (antes sin tenant se veian todas)', async () => {
    expect((await transfers.findAll(tA)).map((t) => t.concept)).toEqual(['Prestamo A']);
    expect(await transfers.findAll(tB)).toEqual([]);
    expect(await transfers.findAll(undefined)).toEqual([]);
  });

  it('transferencias por id: B no autoriza ni rechaza la de A', async () => {
    await expect(transfers.authorize(transA, tB)).rejects.toBeInstanceOf(BadRequestException);
    await expect(transfers.reject(transA, 'no', tB)).rejects.toBeInstanceOf(BadRequestException);
    expect((await ds.getRepository(Transfer).findOneBy({ id: transA }))!.status).toBe('PENDIENTE');
  });

  it('controlador de transferencias: tenant del token, token sin tenant 403, SOPORTE con ?tenantId=', () => {
    const svc: any = { findAll: jest.fn(), create: jest.fn(), authorize: jest.fn(), reject: jest.fn() };
    const ctrl = new TransfersController(svc);
    expect(() => ctrl.findAll({ user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    ctrl.findAll({ user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(svc.findAll.mock.calls[0][0]).toBe(tA);
    ctrl.findAll({ user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(svc.findAll.mock.calls[1][0]).toBe(tB);
    ctrl.findAll({ user: { roleCode: 'SOPORTE' }, query: {} });
    expect(svc.findAll.mock.calls[2][0]).toBeUndefined();
    expect(() => ctrl.reject('id', { motivo: 'x' }, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
  });

  it('bitacora: cada ADMIN ve solo la de su tenant', async () => {
    const a = resp(await audit.findAll({ user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } }));
    expect(a.map((l: any) => l.userEmail)).toEqual(['a@x.mx']);
    const b = resp(await audit.findAll({ user: { roleCode: 'ADMIN', tenantId: tB }, query: {} }));
    expect(b.map((l: any) => l.userEmail)).toEqual(['b@x.mx']);
  });

  it('bitacora: un token sin tenant que no es SOPORTE recibe 403 (antes veia la bitacora de todos)', async () => {
    await expect(Promise.resolve().then(() => audit.findAll({ user: { roleCode: 'ADMIN' }, query: {} }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bitacora: SOPORTE ve todo o acota con ?tenantId=', async () => {
    const todo = resp(await audit.findAll({ user: { roleCode: 'SOPORTE' }, query: {} }));
    expect(todo.map((l: any) => l.userEmail).sort()).toEqual(['a@x.mx', 'b@x.mx']);
    const soloB = resp(await audit.findAll({ user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } }));
    expect(soloB.map((l: any) => l.userEmail)).toEqual(['b@x.mx']);
  });
});
