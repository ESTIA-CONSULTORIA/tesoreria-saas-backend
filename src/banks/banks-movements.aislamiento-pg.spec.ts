import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { ForbiddenException } from '@nestjs/common';
import { BanksService } from './banks.service';
import { BanksController } from './banks.controller';
import { MovementsService } from '../movements/movements.service';
import { MovementsController } from '../movements/movements.controller';
import { Bank } from './entities/bank.entity';
import { Movement } from '../movements/entities/movement.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

dotenv.config();

// Bancos y movimientos contra Postgres real (esquema temporal). Antes: GET /banks y GET /movements con X-Company-Id de
// OTRO tenant devolvian sus cuentas y movimientos, GET /banks/branch/:id listaba las cuentas de cualquier sucursal, y
// GET /movements?type=... (sin accountId) devolvia los movimientos de TODOS los tenants.
describe('Bancos y movimientos: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_bankmov_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let banks: BanksService;
  let movs: MovementsService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, brA: string, coB: string, bankA: string, bankB: string;

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
    // BanksService.findByCompany usa SQL crudo sin esquema: el search_path debe apuntar al esquema temporal
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Bank, Movement, Branch, Company], extra: { options: `-c search_path=${schema},public` } }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' });
    brA = await guardar(Branch, { companyId: coA, name: 'Matriz A' });
    const brB = await guardar(Branch, { companyId: coB, name: 'Matriz B' });
    bankA = await guardar(Bank, { branchId: brA, tenantId: tA, name: 'Banco A', balance: 100, isActive: true });
    bankB = await guardar(Bank, { branchId: brB, tenantId: tB, name: 'Banco B', balance: 50, isActive: true });
    await guardar(Movement, { accountId: bankA, type: 'INCOME', concept: 'Venta A', amount: 100 });
    await guardar(Movement, { accountId: bankB, type: 'INCOME', concept: 'Venta B', amount: 50 });

    banks = new BanksService(ds.getRepository(Bank), ds);
    movs = new MovementsService(ds.getRepository(Movement), ds.getRepository(Bank), ds as any);
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: cada tenant ve lo suyo', async () => {
    expect((await banks.findByCompany(coA, tA)).map((b: any) => b.name)).toEqual(['Banco A']);
    expect((await movs.findByCompany(coA, tA)).map((m) => m.concept)).toEqual(['Venta A']);
    const p = await movs.findWithFilters(undefined, 'INCOME', undefined, undefined, undefined, 1, 10, tA);
    expect(p.data.map((m) => m.concept)).toEqual(['Venta A']);
    expect(p.total).toBe(1);
  });

  it('bancos: la empresa de otro tenant (X-Company-Id) o sin tenant devuelve vacio', async () => {
    expect(await banks.findByCompany(coA, tB)).toEqual([]);
    expect(await banks.findByCompany(coB, tA)).toEqual([]);
    expect(await banks.findByCompany(coA, undefined)).toEqual([]);
  });

  it('movimientos: empresa ajena o sin tenant devuelve vacio', async () => {
    expect(await movs.findByCompany(coA, tB)).toEqual([]);
    expect(await movs.findByCompany(coA, undefined)).toEqual([]);
  });

  it('movimientos con filtros: nunca los de todos los tenants (antes ?type= sin accountId los devolvia todos)', async () => {
    const b = await movs.findWithFilters(undefined, 'INCOME', undefined, undefined, undefined, 1, 10, tB);
    expect(b.data.map((m) => m.concept)).toEqual(['Venta B']);
    const sin = await movs.findWithFilters(undefined, 'INCOME', undefined, undefined, undefined, 1, 10, undefined);
    expect(sin).toEqual({ data: [], page: 1, limit: 10, total: 0, totalPages: 0 });
    // pedir la cuenta de A siendo B: vacio, no los movimientos de A
    const ajena = await movs.findWithFilters(bankA, undefined, undefined, undefined, undefined, 1, 10, tB);
    expect(ajena.data).toEqual([]);
    expect(ajena.total).toBe(0);
  });

  it('bancos de una sucursal: B no lista las cuentas de la sucursal de A', async () => {
    await expect(banks.findByBranch(brA, tB)).rejects.toThrow();
  });

  it('controladores: tenant del token (query ignorado), SOPORTE con ?tenantId=, token sin tenant 403', async () => {
    const bs: any = { findByBranch: jest.fn(), findByCompany: jest.fn().mockResolvedValue([]), findByTenant: jest.fn().mockResolvedValue([]) };
    const bc = new BanksController(bs);
    expect(() => bc.findAll(undefined, undefined, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    bc.findAll(undefined, coB, { user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(bs.findByCompany).toHaveBeenCalledWith(coB, tA); // la empresa pedida se valida contra el tenant del token
    expect(bc.findAll(undefined, undefined, { user: { roleCode: 'SOPORTE' }, query: {} })).toEqual([]);
    expect(() => bc.findByBranch(brA, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);

    const ms: any = { findByCompany: jest.fn().mockResolvedValue([]), findWithFilters: jest.fn().mockResolvedValue({}) };
    const mc = new MovementsController(ms);
    expect(() => mc.findAll(undefined, undefined, undefined, 'INCOME', undefined, undefined, undefined, undefined, undefined, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
  });
});
