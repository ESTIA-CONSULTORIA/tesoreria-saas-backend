import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { NotFoundException } from '@nestjs/common';
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

// getPendingDeposits / confirmDeposit contra Postgres real (esquema temporal). Antes: sin tenant se devolvian
// turnos de todos los tenants, y confirmDeposit aceptaba cualquier turno/cuenta por id sin mirar el tenant.
describe('TreasuryService depositos: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_depositos_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: TreasuryService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let bankA: string, bankB: string, shiftA: string, shiftB: string;

  const base = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'estia',
  });

  async function tenantConBanco(tenantId: string, nombre: string) {
    const co = await ds.getRepository(Company).save(ds.getRepository(Company).create({ tenantId, tradeName: nombre } as any) as any);
    const br = await ds.getRepository(Branch).save(ds.getRepository(Branch).create({ companyId: (co as any).id, name: nombre } as any) as any);
    const bk = await ds.getRepository(Bank).save(ds.getRepository(Bank).create({ branchId: (br as any).id, tenantId, name: nombre, balance: 1000, isActive: true } as any) as any);
    return (bk as any).id as string;
  }
  const turno = async (tenantId: string, cajero: string) => {
    const r: any = await ds.getRepository(Shift).save(ds.getRepository(Shift).create({ tenantId, sucursalId: 'suc', cajero, fecha: '2026-11-01', horaApertura: '08:00', horaCierre: '16:00', status: 'CERRADO', totalEfectivo: 800, fondoInicial: 200 } as any) as any);
    return r.id as string;
  };

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [Bank, Movement, PaymentSchedule, Purchase, Supplier, Company, Branch, Shift, Transfer],
    }).initialize();
    bankA = await tenantConBanco(tA, 'A');
    bankB = await tenantConBanco(tB, 'B');
    shiftA = await turno(tA, 'cajeroA');
    shiftB = await turno(tB, 'cajeroB');
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

  it('getPendingDeposits: cada tenant ve solo sus turnos', async () => {
    expect((await svc.getPendingDeposits(tA)).deposits.map((d) => d.cajero)).toEqual(['cajeroA']);
    expect((await svc.getPendingDeposits(tB)).deposits.map((d) => d.cajero)).toEqual(['cajeroB']);
  });

  it('getPendingDeposits: sin tenant devuelve vacio, no los turnos de todos', async () => {
    expect(await svc.getPendingDeposits(undefined as any)).toEqual({ deposits: [], total: 0 });
    expect(await svc.getPendingDeposits('' as any)).toEqual({ deposits: [], total: 0 });
  });

  it('confirmDeposit: turno de otro tenant -> 404 y no toca saldo ni movimientos', async () => {
    await expect(svc.confirmDeposit(shiftB, tA, bankA, 100)).rejects.toBeInstanceOf(NotFoundException);
    expect(Number((await ds.getRepository(Bank).findOneBy({ id: bankA }))!.balance)).toBe(1000);
    expect(await ds.getRepository(Movement).count()).toBe(0);
  });

  it('confirmDeposit: cuenta de otro tenant con turno propio -> 404 y el saldo ajeno no cambia', async () => {
    await expect(svc.confirmDeposit(shiftA, tA, bankB, 100)).rejects.toBeInstanceOf(NotFoundException);
    expect(Number((await ds.getRepository(Bank).findOneBy({ id: bankB }))!.balance)).toBe(1000);
    expect(await ds.getRepository(Movement).count()).toBe(0);
  });

  it('confirmDeposit: sin tenant en el token -> 404', async () => {
    await expect(svc.confirmDeposit(shiftA, undefined as any, bankA, 100)).rejects.toBeInstanceOf(NotFoundException);
    expect(await ds.getRepository(Movement).count()).toBe(0);
  });

  it('confirmDeposit: turno y cuenta del propio tenant -> funciona', async () => {
    const r = await svc.confirmDeposit(shiftA, tA, bankA, 600);
    expect(r.success).toBe(true);
    expect(Number((await ds.getRepository(Bank).findOneBy({ id: bankA }))!.balance)).toBe(1600);
    expect(await ds.getRepository(Movement).count()).toBe(1);
  });
});
