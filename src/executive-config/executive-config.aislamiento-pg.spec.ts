import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExecutiveConfigService } from './executive-config.service';
import { ExecutiveConfigController } from './executive-config.controller';
import { ExecutiveConfig } from './entities/executive-config.entity';

dotenv.config();

// Vista ejecutiva contra Postgres real (esquema temporal). Antes: con tenantId indefinido (token SOPORTE sin tenant) findOne
// devolvia la configuracion de CUALQUIER negocio y upsert la modificaba; el body se pasaba entero a update() (id, tenantId...).
describe('ExecutiveConfig: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_execcfg_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: ExecutiveConfigService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let cfgA: string;

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
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [ExecutiveConfig] }).initialize();
    const repo = ds.getRepository(ExecutiveConfig);
    cfgA = ((await repo.save(repo.create({ tenantId: tA, theme: 'dark', modules: { ventas: true } } as any))) as any).id;
    svc = new ExecutiveConfigService(repo);
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A lee y edita su configuracion', async () => {
    expect((await svc.findByTenant(tA))!.theme).toBe('dark');
    expect((await svc.upsert(tA, { theme: 'light' }))!.theme).toBe('light');
  });

  it('sin tenant: no devuelve la configuracion de otro negocio y no la modifica (antes devolvia/pisaba la de cualquiera)', async () => {
    expect(await svc.findByTenant(undefined as any)).toBeNull();
    await expect(svc.upsert(undefined as any, { theme: 'hackeado' })).rejects.toBeInstanceOf(BadRequestException);
    expect((await ds.getRepository(ExecutiveConfig).findOneBy({ id: cfgA }))!.theme).toBe('light');
  });

  it('B tiene su propia configuracion y no toca la de A; el body solo puede cambiar theme y modules', async () => {
    expect(await svc.findByTenant(tB)).toBeNull();
    const b = await svc.upsert(tB, { theme: 'solar' });
    expect(b!.tenantId).toBe(tB);
    // body malicioso: intenta reasignar el tenant y el id
    await svc.upsert(tB, { theme: 'oscuro', tenantId: tA, id: cfgA } as any);
    expect(await ds.getRepository(ExecutiveConfig).findOneBy({ id: cfgA })).toMatchObject({ tenantId: tA, theme: 'light' });
    expect((await svc.findByTenant(tB))!.theme).toBe('oscuro');
    expect(await ds.getRepository(ExecutiveConfig).count()).toBe(2);
  });

  it('controlador: tenant del token (query ignorado), SOPORTE con ?tenantId=, token sin tenant 403', async () => {
    const service: any = { findByTenant: jest.fn(), upsert: jest.fn() };
    const ctrl = new ExecutiveConfigController(service);
    expect(() => ctrl.findMine({ user: { roleCode: 'ADMIN', executiveAccess: true } })).toThrow(ForbiddenException);
    ctrl.findMine({ user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(service.findByTenant).toHaveBeenCalledWith(tA);
    ctrl.update({ user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } }, { theme: 'x' });
    expect(service.upsert).toHaveBeenCalledWith(tB, { theme: 'x' });
    expect(() => ctrl.update({ user: { roleCode: 'SOPORTE' }, query: {} }, { theme: 'x' })).toThrow(BadRequestException);
  });
});
