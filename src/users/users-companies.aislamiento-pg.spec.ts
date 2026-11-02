import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Reflector } from '@nestjs/core';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CompaniesService } from '../companies/companies.service';
import { CompaniesController } from '../companies/companies.controller';
import { RolesGuard } from '../auth/roles.guard';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';

dotenv.config();

// Usuarios y empresas contra Postgres real (esquema temporal). Antes: cualquier usuario autenticado (un cajero) podia crear
// usuarios con cualquier rol (incluido SOPORTE, que ignora los limites de tenant) o ascender a otro; un token sin tenant que
// no es SOPORTE creaba usuarios/empresas en el tenant del body; las empresas/sucursales del body no se validaban contra el
// tenant; y GET /companies/tenant/:id (publico) devolvia la fila completa (RFC, razon social, moneda, tenantId...).
describe('Usuarios y empresas: aislamiento y escalada contra Postgres real', () => {
  const schema = `test_usrcomp_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let users: UsersService;
  let companies: CompaniesService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, brA: string, coB: string, brB: string, soporteId: string, userAId: string;

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
  const guardia = (clase: any, metodo: string, roleCode?: string) =>
    new RolesGuard(new Reflector()).canActivate({
      getHandler: () => clase.prototype[metodo],
      getClass: () => clase,
      switchToHttp: () => ({ getRequest: () => ({ user: roleCode ? { roleCode } : undefined }) }),
    } as any);

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    // assertSucursalDelTenant usa SQL crudo sin esquema: el search_path apunta al esquema temporal (y a public por uuid-ossp)
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [User, Tenant, Company, Branch], extra: { options: `-c search_path=${schema},public` } }).initialize();

    await guardar(Tenant, { id: tA, tradeName: 'Negocio A' }).catch(() => undefined);
    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A', legalName: 'Empresa A SA de CV', taxId: 'AAA010101AAA', baseCurrency: 'MXN', isActive: true });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B', legalName: 'Empresa B SA de CV', taxId: 'BBB010101BBB', baseCurrency: 'USD', isActive: true });
    brA = await guardar(Branch, { companyId: coA, name: 'Matriz A' });
    brB = await guardar(Branch, { companyId: coB, name: 'Matriz B' });
    soporteId = await guardar(User, { email: 'soporte@estia.mx', password: 'x', roleCode: 'SOPORTE', isActive: true });
    userAId = await guardar(User, { email: 'cajero-a@x.mx', password: 'x', roleCode: 'CAJERO', tenantId: tA, companyId: coA, branchId: brA, isActive: true });

    users = new UsersService(ds.getRepository(User), ds.getRepository(Tenant));
    companies = new CompaniesService(ds.getRepository(Company), ds.getRepository(Tenant));
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('guardias de rol: un cajero (y un token sin rol) no gestiona usuarios ni empresas; ADMIN/GERENTE/SOPORTE si', () => {
    for (const m of ['create', 'update', 'remove']) {
      expect(() => guardia(UsersController, m, 'CAJERO')).toThrow(ForbiddenException);
      expect(() => guardia(UsersController, m, 'MESERO')).toThrow(ForbiddenException);
      expect(() => guardia(UsersController, m, undefined)).toThrow(ForbiddenException);
      for (const rol of ['ADMIN', 'GERENTE', 'SOPORTE']) expect(guardia(UsersController, m, rol)).toBe(true);
    }
    for (const m of ['create', 'update', 'remove']) {
      expect(() => guardia(CompaniesController, m === 'update' ? 'update' : m, 'CAJERO')).toThrow(ForbiddenException);
      expect(() => guardia(CompaniesController, m, 'GERENTE')).toThrow(ForbiddenException);
      expect(guardia(CompaniesController, m, 'ADMIN')).toBe(true);
      expect(guardia(CompaniesController, m, 'SOPORTE')).toBe(true);
    }
  });

  it('escalada de rol: nadie asigna un rol por encima del suyo (SOPORTE solo lo asigna SOPORTE)', async () => {
    const crear = (email: string, rol: string, quien: string, tenant: string | undefined = tA) =>
      users.create(email, 'Clave12345', 'X', undefined, rol, tenant, rol === 'CAJERO' ? coA : undefined, rol === 'CAJERO' ? brA : undefined, undefined, quien);
    await expect(crear('s1@x.mx', 'SOPORTE', 'ADMIN')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(crear('s2@x.mx', 'SOPORTE', 'GERENTE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(crear('a1@x.mx', 'ADMIN', 'GERENTE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(crear('r1@x.mx', 'ROL_INVENTADO', 'GERENTE')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(crear('c0@x.mx', 'CAJERO', 'NINGUNO')).rejects.toBeInstanceOf(ForbiddenException);
    expect(await ds.getRepository(User).count({ where: { email: 's1@x.mx' } })).toBe(0);
    // lo legitimo sigue funcionando
    expect((await crear('c1@x.mx', 'CAJERO', 'GERENTE')).roleCode).toBe('CAJERO');
    expect((await crear('a2@x.mx', 'ADMIN', 'ADMIN')).roleCode).toBe('ADMIN');
    expect((await crear('s3@x.mx', 'SOPORTE', 'SOPORTE', undefined)).roleCode).toBe('SOPORTE');
  });

  it('un cajero no se asciende a si mismo ni toca a un SOPORTE; el ADMIN tampoco borra ni edita a un SOPORTE', async () => {
    await expect(users.update(userAId, { roleCode: 'ADMIN' }, { roleCode: 'GERENTE', tenantId: tA })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(users.update(userAId, { roleCode: 'SOPORTE' }, { roleCode: 'ADMIN', tenantId: tA })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(users.update(soporteId, { name: 'x' }, { roleCode: 'ADMIN', tenantId: tA })).rejects.toBeInstanceOf(NotFoundException);
    await expect(users.remove(soporteId, tA, 'ADMIN')).rejects.toBeInstanceOf(NotFoundException);
    expect(await ds.getRepository(User).findOneBy({ id: soporteId })).not.toBeNull();
    expect(await ds.getRepository(User).findOneBy({ id: userAId })).toMatchObject({ roleCode: 'CAJERO' });
  });

  it('tenant: B no toca usuarios de A; empresa/sucursal ajena en el body es 404/400', async () => {
    await expect(users.update(userAId, { name: 'x' }, { roleCode: 'ADMIN', tenantId: tB })).rejects.toBeInstanceOf(NotFoundException);
    await expect(users.remove(userAId, tB, 'ADMIN')).rejects.toBeInstanceOf(NotFoundException);
    await expect(users.create('b1@x.mx', 'Clave12345', 'X', undefined, 'CAJERO', tB, coA, brB, undefined, 'ADMIN')).rejects.toBeInstanceOf(NotFoundException); // empresa de A
    await expect(users.create('b2@x.mx', 'Clave12345', 'X', undefined, 'CAJERO', tB, coB, brA, undefined, 'ADMIN')).rejects.toBeInstanceOf(BadRequestException); // sucursal de A
    await expect(users.update(userAId, { branchId: brB }, { roleCode: 'ADMIN', tenantId: tA })).rejects.toBeInstanceOf(BadRequestException); // sucursal de B para un usuario de A
    await expect(users.updateCompany(userAId, coB)).rejects.toBeInstanceOf(NotFoundException);
    expect((await ds.getRepository(User).findOneBy({ id: userAId }))!.branchId).toBe(brA);
  });

  it('controlador de usuarios: tenant del token (el body.tenantId solo vale para SOPORTE), token sin tenant 403', async () => {
    const svc: any = { create: jest.fn().mockResolvedValue({}), findByRole: jest.fn().mockResolvedValue([]) };
    const ctrl = new UsersController(svc);
    await ctrl.create({ email: 'e', password: 'p', roleCode: 'CAJERO', tenantId: tB } as any, { user: { roleCode: 'ADMIN', tenantId: tA } });
    expect(svc.create.mock.calls[0][5]).toBe(tA);
    expect(svc.create.mock.calls[0][9]).toBe('ADMIN'); // el rol de quien pide viaja al servicio
    await ctrl.create({ email: 'e', password: 'p', roleCode: 'ADMIN', tenantId: tB } as any, { user: { roleCode: 'SOPORTE' } });
    expect(svc.create.mock.calls[1][5]).toBe(tB);
    expect(() => ctrl.create({ email: 'e', password: 'p', tenantId: tB } as any, { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
  });

  it('empresas: GET publico /companies/tenant/:id solo expone id, nombre comercial y razon social (sin RFC, moneda ni tenantId)', async () => {
    const ctrl = new CompaniesController(companies);
    const r: any[] = await ctrl.findByTenant(tA);
    expect(r).toEqual([{ id: coA, tradeName: 'Empresa A', legalName: 'Empresa A SA de CV' }]);
    expect(JSON.stringify(r)).not.toMatch(/AAA010101AAA|taxId|baseCurrency|tenantId|MXN/);
    expect(JSON.stringify(await ctrl.findByTenant(tB))).not.toMatch(/Empresa A|AAA010101AAA/);
  });

  it('empresas: el tenant sale del token; un token sin tenant que no es SOPORTE no da de alta empresas', async () => {
    const svc: any = { create: jest.fn().mockResolvedValue({}) };
    const ctrl = new CompaniesController(svc);
    await ctrl.create({ tenantId: tB, legalName: 'L', tradeName: 'T' }, { user: { roleCode: 'ADMIN', tenantId: tA } });
    expect(svc.create.mock.calls[0][0]).toBe(tA);
    await ctrl.create({ tenantId: tB, legalName: 'L', tradeName: 'T' }, { user: { roleCode: 'SOPORTE' } });
    expect(svc.create.mock.calls[1][0]).toBe(tB);
    expect(() => ctrl.create({ tenantId: tB, legalName: 'L', tradeName: 'T' }, { user: { roleCode: 'ADMIN' } })).toThrow(/sin tenant/i);
  });
});
