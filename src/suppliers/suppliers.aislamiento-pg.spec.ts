import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { Supplier } from './entities/supplier.entity';
import { Purchase } from '../purchases/entities/purchase.entity';

dotenv.config();

// Proveedores contra Postgres real (esquema temporal). Antes: GET /suppliers sin tenant listaba los de todos los
// tenants (y aceptaba ?tenantId= de cualquier token sin tenant), GET /suppliers/:id/purchases con token sin tenant
// devolvia las compras de cualquier proveedor, y el alta aceptaba id del body (pisaba al proveedor de otro tenant).
describe('SuppliersService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_suppliers_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: SuppliersService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let supA: string;

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
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Supplier, Purchase] }).initialize();
    supA = await guardar(Supplier, { tenantId: tA, nombre: 'Prov A', isActive: true });
    await guardar(Purchase, { tenantId: tA, supplierId: supA, numero: 'F-A', status: 'PENDIENTE', total: 100, montoPagado: 0 });
    svc = new SuppliersService(ds.getRepository(Supplier), ds.getRepository(Purchase));
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve sus proveedores y compras', async () => {
    expect((await svc.findAll(tA)).map((s) => s.nombre)).toEqual(['Prov A']);
    expect((await svc.findPurchasesBySupplier(supA, tA)).map((p) => p.numero)).toEqual(['F-A']);
    expect((await svc.findOne(supA, tA))!.nombre).toBe('Prov A');
  });

  it('listado: B y "sin tenant" no ven proveedores de A', async () => {
    expect(await svc.findAll(tB)).toEqual([]);
    expect(await svc.findAll(undefined)).toEqual([]);
  });

  it('compras de un proveedor: B recibe 404 (no las compras de A); SOPORTE (sin tenant) consulta por id', async () => {
    await expect(svc.findPurchasesBySupplier(supA, tB)).rejects.toBeInstanceOf(NotFoundException);
    expect((await svc.findPurchasesBySupplier(supA, undefined)).length).toBe(1);
  });

  it('por id: B no lee, edita, desactiva ni borra al proveedor de A', async () => {
    await expect(svc.findOne(supA, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(supA, { nombre: 'Hackeado' }, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.softDelete(supA, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.delete(supA, tB)).rejects.toBeInstanceOf(NotFoundException);
    expect(await ds.getRepository(Supplier).findOneBy({ id: supA })).toMatchObject({ nombre: 'Prov A', isActive: true });
  });

  it('alta: sin tenant 400 y el id del body no pisa al proveedor de A', async () => {
    expect(() => svc.create({ nombre: 'X' } as any)).toThrow(BadRequestException);
    const s: any = await svc.create({ id: supA, tenantId: tB, nombre: 'Prov B' } as any);
    expect(s.id).not.toBe(supA);
    expect(await ds.getRepository(Supplier).findOneBy({ id: supA })).toMatchObject({ tenantId: tA, nombre: 'Prov A' });
  });

  it('controlador: token sin tenant que no es SOPORTE 403 (ni con ?tenantId=); SOPORTE con ?tenantId=; alta toma el tenant del token', () => {
    const service: any = { findAll: jest.fn(), findPurchasesBySupplier: jest.fn(), create: jest.fn() };
    const ctrl = new SuppliersController(service);
    expect(() => ctrl.findAll(tA, undefined, undefined, undefined, { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
    ctrl.findAll(tB, undefined, undefined, undefined, { user: { roleCode: 'ADMIN', tenantId: tA } });
    expect(service.findAll.mock.calls[0][0]).toBe(tA);
    ctrl.findAll(tB, undefined, undefined, undefined, { user: { roleCode: 'SOPORTE' } });
    expect(service.findAll.mock.calls[1][0]).toBe(tB);
    ctrl.findAll(undefined, undefined, undefined, undefined, { user: { roleCode: 'SOPORTE' } });
    expect(service.findAll.mock.calls[2][0]).toBeUndefined();
    expect(() => ctrl.getSupplierPurchases('x', { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
    ctrl.create({ nombre: 'n', tenantId: tB }, { user: { roleCode: 'ADMIN', tenantId: tA }, query: {} });
    expect(service.create.mock.calls[0][0].tenantId).toBe(tA);
    expect(() => ctrl.create({ nombre: 'n' }, { user: { roleCode: 'SOPORTE' }, query: {} })).toThrow(BadRequestException);
  });
});
