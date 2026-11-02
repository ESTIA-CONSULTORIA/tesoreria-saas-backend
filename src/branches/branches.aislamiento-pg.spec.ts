import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Reflector } from '@nestjs/core';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';
import { RolesGuard } from '../auth/roles.guard';
import { Branch } from './entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

dotenv.config();

// Sucursales contra Postgres real (esquema temporal). Antes: POST/PATCH/DELETE /branches no tenian guardia de rol (un
// cajero podia crear o borrar sucursales), un token sin tenant que no es SOPORTE listaba TODAS las sucursales de todos los
// negocios y creaba sucursales bajo la empresa de cualquiera, y PATCH permitia pasar una sucursal a la empresa de otro negocio.
describe('Sucursales: guardias de rol y aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_branches_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: BranchesService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, coA2: string, coB: string, brA: string;

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
  const guardia = (metodo: string, roleCode?: string) =>
    new RolesGuard(new Reflector()).canActivate({
      getHandler: () => BranchesController.prototype[metodo as keyof BranchesController],
      getClass: () => BranchesController,
      switchToHttp: () => ({ getRequest: () => ({ user: roleCode ? { roleCode } : undefined }) }),
    } as any);

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Branch, Company, Tenant] }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    coA2 = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A2' });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' });
    brA = await guardar(Branch, { companyId: coA, code: 'A1', name: 'Matriz A' });
    await guardar(Branch, { companyId: coB, code: 'B1', name: 'Matriz B' });

    svc = new BranchesService(ds.getRepository(Branch), ds.getRepository(Company), ds.getRepository(Tenant));
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('guardias de rol: cajero, mesero y token sin rol no crean, editan ni borran; ADMIN, GERENTE y SOPORTE si', () => {
    for (const m of ['create', 'update', 'remove']) {
      for (const rol of ['CAJERO', 'MESERO', 'CAPITAN', 'RECEPCION', 'USER', undefined]) {
        expect(() => guardia(m, rol)).toThrow(ForbiddenException);
      }
      for (const rol of ['ADMIN', 'GERENTE', 'SOPORTE']) expect(guardia(m, rol)).toBe(true);
    }
  });

  it('sanidad: A ve sus sucursales', async () => {
    expect((await svc.findByTenant(tA)).map((b) => b.name)).toEqual(['Matriz A']);
    expect((await svc.findByCompany(coA, tA)).length).toBe(1);
  });

  it('alta: la empresa debe existir y ser del tenant (antes, sin tenant, se creaba bajo cualquier empresa)', async () => {
    await expect(svc.create(coA, 'X', 'Intrusa', undefined, undefined, undefined, tB)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.create('00000000-0000-4000-8000-000000000000', 'X', 'Fantasma', undefined, undefined, undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Branch).count({ where: { name: 'Intrusa' } })).toBe(0);
    expect((await svc.create(coA, 'A2', 'Sucursal 2', undefined, undefined, undefined, tA)).name).toBe('Sucursal 2');
  });

  it('por id: B no edita ni borra la sucursal de A, ni la pasa a su empresa; A solo la mueve dentro de su negocio', async () => {
    await expect(svc.update(brA, { name: 'Hackeada' }, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(brA, tB)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update(brA, { companyId: coB }, tA)).rejects.toBeInstanceOf(BadRequestException); // a la empresa de otro negocio
    expect(await ds.getRepository(Branch).findOneBy({ id: brA })).toMatchObject({ name: 'Matriz A', companyId: coA });
    expect((await svc.update(brA, { companyId: coA2 }, tA))!.companyId).toBe(coA2); // misma organizacion: permitido
  });

  it('listado: B no ve las sucursales de la empresa de A', async () => {
    await expect(svc.findByCompany(coA, tB)).rejects.toBeInstanceOf(NotFoundException);
    expect((await svc.findByTenant(tB)).map((b) => b.name)).toEqual(['Matriz B']);
  });

  it('controlador: token sin tenant que no es SOPORTE 403; SOPORTE sin ?tenantId= ni empresa recibe vacio (antes: todas las sucursales)', async () => {
    const service: any = { findByTenant: jest.fn().mockResolvedValue([]), findByCompany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() };
    const ctrl = new BranchesController(service);
    expect(() => ctrl.findAll(undefined, undefined, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    expect(ctrl.findAll(undefined, undefined, { user: { roleCode: 'SOPORTE' }, query: {} })).toEqual([]);
    ctrl.findAll(undefined, undefined, { user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(service.findByTenant).toHaveBeenCalledWith(tB);
    ctrl.findAll(undefined, undefined, { user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB } });
    expect(service.findByTenant).toHaveBeenLastCalledWith(tA);
    expect(() => ctrl.create({ companyId: coA, code: 'x', name: 'x' }, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    expect(() => ctrl.update('id', {}, { user: { roleCode: 'GERENTE' } })).toThrow(ForbiddenException);
  });
});
