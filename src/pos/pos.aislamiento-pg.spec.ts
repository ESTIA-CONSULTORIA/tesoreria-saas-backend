import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { SalesService } from './sales.service';
import { TablesService } from './tables.service';
import { ShiftsController } from './shifts.controller';
import { SalesController } from './sales.controller';
import { Shift } from './entities/shift.entity';
import { Sale } from './entities/sale.entity';
import { Table } from './entities/table.entity';
import { Area } from './entities/area.entity';

dotenv.config();

// POS contra Postgres real (esquema temporal). Antes: ShiftsService.findOpenShift buscaba como respaldo un turno ABIERTO
// por NOMBRE de cajero en TODOS los tenants (el nombre no es unico entre negocios) y los listados de turnos, ventas y
// mesas sin tenant devolvian los de todos los tenants.
describe('POS: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_pos_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let shifts: ShiftsService;
  let sales: SalesService;
  let tables: TablesService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';

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
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Shift, Sale, Table, Area] }).initialize();

    // El mismo cajero ("juan") con turno abierto en AMBOS tenants, y una venta y una mesa solo de A
    await guardar(Shift, { cajero: 'juan', sucursalId: 'suc-A', tenantId: tA, fecha: new Date(), horaApertura: '08:00', status: 'ABIERTO', fondoInicial: 100 });
    await guardar(Shift, { cajero: 'maria', sucursalId: 'suc-A', tenantId: tA, fecha: new Date(), horaApertura: '08:00', status: 'ABIERTO', fondoInicial: 100 });
    await guardar(Table, { tenantId: tA, branchId: 'suc-A', number: 1 });

    shifts = new ShiftsService(ds.getRepository(Shift), ds.getRepository(Sale));
    sales = Object.create(SalesService.prototype);
    (sales as any).salesRepo = ds.getRepository(Sale);
    tables = new TablesService(ds.getRepository(Table), {} as any);
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve sus turnos y mesas', async () => {
    expect((await shifts.findAll({ tenantId: tA })).length).toBe(2);
    expect((await shifts.findOpenShift('juan', 'suc-A', tA))!.tenantId).toBe(tA);
    expect((await tables.findAll(undefined, undefined, tA)).length).toBe(1);
  });

  it('turno abierto: B no recibe el turno de "juan" de A (antes el respaldo buscaba solo por nombre)', async () => {
    expect(await shifts.findOpenShift('juan', 'suc-A', tB)).toBeNull();
    expect(await shifts.findOpenShift('juan', undefined as any, tB)).toBeNull();
    expect(await shifts.findOpenShift('juan', 'suc-A', undefined)).toBeNull(); // sin tenant: nada
  });

  it('listados de B y "sin tenant": turnos, ventas y mesas vacios', async () => {
    for (const t of [tB, undefined]) {
      expect(await shifts.findAll({ tenantId: t })).toEqual([]);
      expect(await sales.findAll({ tenantId: t })).toEqual([]);
      expect(await tables.findAll(undefined, undefined, t)).toEqual([]);
    }
    expect(await shifts.findAll({})).toEqual([]);
  });

  it('controladores: token sin tenant que no es SOPORTE 403; SOPORTE lista solo con ?tenantId=; el tenant del body no cuenta', async () => {
    const shiftsSvc: any = { findAll: jest.fn().mockResolvedValue([]), findOpenShift: jest.fn().mockResolvedValue(null), openShift: jest.fn().mockResolvedValue({}) };
    const sc = new ShiftsController(shiftsSvc);
    expect(() => sc.getShifts({}, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    sc.getShifts({}, { user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(shiftsSvc.findAll.mock.calls[0][0].tenantId).toBe(tA);
    sc.getShifts({}, { user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(shiftsSvc.findAll.mock.calls[1][0].tenantId).toBe(tB);
    sc.getShifts({}, { user: { roleCode: 'SOPORTE' }, query: {} });
    expect(shiftsSvc.findAll.mock.calls[2][0].tenantId).toBeUndefined();

    const salesSvc: any = { findAll: jest.fn().mockResolvedValue([]) };
    const salc = new SalesController(salesSvc, {} as any);
    expect(() => salc.getSales({}, { user: { roleCode: 'CAJERO' } })).toThrow(ForbiddenException);
    await salc.getSales({}, { user: { roleCode: 'CAJERO', tenantId: tA }, query: {} });
    expect(salesSvc.findAll.mock.calls[0][0].tenantId).toBe(tA);

    const offline: any = { evaluar: jest.fn() };
    const salc2 = new SalesController({} as any, offline);
    expect(() => salc2.evaluarVentaOffline({ payload: {} }, { user: { roleCode: 'SOPORTE' }, query: {} })).toThrow(BadRequestException);
  });
});
