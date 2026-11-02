import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { Purchase } from './entities/purchase.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { FamiliaInsumo } from '../costs/entities/familia-insumo.entity';
import { tenantParaListar, tenantParaEscribir } from '../auth/tenant-access.util';

dotenv.config();

// Compras contra Postgres real (esquema temporal). Antes: sin tenant se listaban TODOS los tenants, un id en el body
// pisaba la orden/factura de otro tenant, y una factura podia marcar la OC o sumar stock de insumos de otro tenant.
describe('PurchasesService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_purchases_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: PurchasesService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, ocA: string, insA: string, supA: string, factA: string;

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
    ds = await new DataSource({
      ...base(), schema, synchronize: true,
      entities: [PurchaseOrder, Purchase, Supplier, Company, Branch, Insumo, FamiliaInsumo],
    }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    supA = await guardar(Supplier, { tenantId: tA, nombre: 'Prov A' });
    insA = await guardar(Insumo, { tenantId: tA, nombre: 'Harina A', stockActual: 10, factorConversion: 1 });
    ocA = await guardar(PurchaseOrder, { tenantId: tA, numero: 'OC-A', status: 'ENVIADA' });
    factA = await guardar(Purchase, { tenantId: tA, numero: 'F-A', status: 'PENDIENTE', total: 100, montoPagado: 0, companyId: coA });

    const costsStub: any = { updateInsumo: (id: string, d: any, m: any) => m.update(Insumo, id, d) };
    svc = new PurchasesService(ds.getRepository(PurchaseOrder), ds.getRepository(Purchase), {} as any, costsStub, ds);
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve lo suyo', async () => {
    expect((await svc.findAllOrders(tA)).map((o) => o.numero)).toEqual(['OC-A']);
    expect((await svc.findAllPurchases(tA)).map((p) => p.numero)).toEqual(['F-A']);
    expect((await svc.getAccountsPayable(tA)).length).toBe(1);
  });

  it('B (sin datos) y "sin tenant" no ven nada de A', async () => {
    for (const t of [tB, undefined]) {
      expect(await svc.findAllOrders(t)).toEqual([]);
      expect(await svc.findAllPurchases(t)).toEqual([]);
      expect(await svc.getAccountsPayable(t)).toEqual([]);
    }
  });

  it('X-Company-Id de otro tenant: sin resultados', async () => {
    const coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' });
    expect(await svc.findAllOrders(tA, undefined, undefined, coB)).toEqual([]);
    expect(await svc.findAllPurchases(tA, undefined, coB)).toEqual([]);
    expect(await svc.getAccountsPayable(tA, coB)).toEqual([]);
    expect((await svc.findAllPurchases(tA, undefined, coA)).length).toBe(1);
    expect(await svc.findAllPurchases(tB, undefined, coA)).toEqual([]);
  });

  it('createOrder / createPurchase sin tenant: 400, nunca filas sin tenant', async () => {
    await expect(svc.createOrder({ numero: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createPurchase({ numero: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createOrder con id ajeno en el body no pisa la orden de A', async () => {
    const o: any = await svc.createOrder({ id: ocA, tenantId: tB, numero: 'OC-B', status: 'BORRADOR' } as any);
    expect(o.id).not.toBe(ocA);
    expect(await ds.getRepository(PurchaseOrder).findOneBy({ id: ocA })).toMatchObject({ tenantId: tA, numero: 'OC-A', status: 'ENVIADA' });
  });

  it('createPurchase con id ajeno en el body no pisa la factura de A', async () => {
    const p: any = await svc.createPurchase({ id: factA, tenantId: tB, numero: 'F-B', status: 'PENDIENTE', total: 1, montoPagado: 0 } as any);
    expect(p.id).not.toBe(factA);
    expect(await ds.getRepository(Purchase).findOneBy({ id: factA })).toMatchObject({ tenantId: tA, numero: 'F-A' });
  });

  it('createPurchase de B no puede facturar la OC de A, usar su proveedor/empresa ni sumarle stock a su insumo', async () => {
    await expect(svc.createPurchase({ tenantId: tB, numero: 'F1', ocId: ocA } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createPurchase({ tenantId: tB, numero: 'F2', supplierId: supA } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createPurchase({ tenantId: tB, numero: 'F3', companyId: coA } as any)).rejects.toBeInstanceOf(NotFoundException);
    // el insumo ajeno se ignora (como un insumo inexistente): la factura de B se crea pero NO suma stock a A
    await svc.createPurchase({ tenantId: tB, numero: 'F4', items: [{ insumoId: insA, cantidad: 5 }] } as any);
    expect((await ds.getRepository(PurchaseOrder).findOneBy({ id: ocA }))!.status).toBe('ENVIADA');
    expect(Number((await ds.getRepository(Insumo).findOneBy({ id: insA }))!.stockActual)).toBe(10);
    expect(await ds.getRepository(Purchase).count({ where: { numero: 'F1' } })).toBe(0); // la transaccion revirtio todo
  });

  it('createPurchase de A con sus propios datos sigue funcionando (OC pasa a FACTURADA, stock sube)', async () => {
    await svc.createPurchase({ tenantId: tA, numero: 'F-OK', ocId: ocA, supplierId: supA, companyId: coA, items: [{ insumoId: insA, cantidad: 5 }] } as any);
    expect((await ds.getRepository(PurchaseOrder).findOneBy({ id: ocA }))!.status).toBe('FACTURADA');
    expect(Number((await ds.getRepository(Insumo).findOneBy({ id: insA }))!.stockActual)).toBe(15);
  });

  it('tenantParaListar / tenantParaEscribir: token sin tenant que no es SOPORTE -> 403; SOPORTE usa ?tenantId= explicito', () => {
    const req = (user: any) => ({ user });
    expect(() => tenantParaListar(req({ roleCode: 'ADMIN' }))).toThrow(/sin tenant/i);
    expect(tenantParaListar(req({ roleCode: 'ADMIN', tenantId: tA }), tB)).toBe(tA); // el query se ignora con tenant en el token
    expect(tenantParaListar(req({ roleCode: 'SOPORTE' }))).toBeUndefined();
    expect(tenantParaListar(req({ roleCode: 'SOPORTE' }), tB)).toBe(tB);
    expect(() => tenantParaEscribir(req({ roleCode: 'SOPORTE' }))).toThrow(BadRequestException);
    expect(tenantParaEscribir(req({ roleCode: 'SOPORTE' }), tB)).toBe(tB);
  });
});
