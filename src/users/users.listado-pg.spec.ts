import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';

dotenv.config();

// Ejecuta listarConNombres contra Postgres real (esquema temporal que se borra al final; no toca datos existentes).
// Los mocks no detectaron el "syntax error at or near '.'" de produccion porque nunca generaban SQL.
// Si no hay Postgres local la suite falla a proposito (no se salta en silencio).
describe('UsersService.listarConNombres contra Postgres real', () => {
  const schema = `test_users_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let service: UsersService;
  let tA: string, tB: string, coA: string, brA: string;

  beforeAll(async () => {
    const base = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'estia',
    };
    const admin = await new DataSource(base).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({ ...base, schema, entities: [User, Tenant, Company, Branch], synchronize: true }).initialize();

    const tenants = ds.getRepository(Tenant);
    const a = await tenants.save(tenants.create({ tradeName: 'Negocio A' } as any) as any);
    const b = await tenants.save(tenants.create({ tradeName: 'Negocio B' } as any) as any);
    tA = (a as any).id; tB = (b as any).id;
    const co = await ds.getRepository(Company).save(ds.getRepository(Company).create({ tradeName: 'Empresa A', tenantId: tA } as any) as any);
    coA = (co as any).id;
    const br = await ds.getRepository(Branch).save(ds.getRepository(Branch).create({ name: 'Matriz A', companyId: coA, tenantId: tA } as any) as any);
    brA = (br as any).id;
    const users = ds.getRepository(User);
    const mk = (email: string, extra: any) => users.save(users.create({ email, password: 'x', name: email, isActive: true, ...extra } as any));
    await mk('admin-a@x.mx', { roleCode: 'ADMIN', tenantId: tA });
    await mk('cajero-a@x.mx', { roleCode: 'CAJERO', tenantId: tA, companyId: coA, branchId: brA });
    await mk('admin-b@x.mx', { roleCode: 'ADMIN', tenantId: tB });
    await mk('soporte@x.mx', { roleCode: 'SOPORTE' }); // rol sin tenant
    service = new UsersService(ds.getRepository(User), ds.getRepository(Tenant));
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource({
      type: 'postgres', host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || 'postgres', database: process.env.DB_NAME || 'estia',
    }).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('ADMIN con tenant: solo ve su negocio, con nombres de negocio, empresa y sucursal', async () => {
    const r = await service.listarConNombres(tA);
    expect(r.map((u) => u.email)).toEqual(['admin-a@x.mx', 'cajero-a@x.mx']);
    expect(r[1]).toMatchObject({ tenantNombre: 'Negocio A', empresaNombre: 'Empresa A', sucursalNombre: 'Matriz A' });
  });

  it('SOPORTE sin ?tenantId=: ve todos los usuarios, incluido el rol sin tenant (nombres null)', async () => {
    const r = await service.listarConNombres(undefined);
    expect(r.map((u) => u.email)).toEqual(['admin-a@x.mx', 'admin-b@x.mx', 'cajero-a@x.mx', 'soporte@x.mx']);
    expect(r.find((u) => u.email === 'soporte@x.mx')).toMatchObject({ tenantNombre: null, empresaNombre: null, sucursalNombre: null });
  });

  it('SOPORTE con ?tenantId=: acota a ese negocio', async () => {
    const r = await service.listarConNombres(tB);
    expect(r.map((u) => u.email)).toEqual(['admin-b@x.mx']);
    expect(r[0].tenantNombre).toBe('Negocio B');
  });

  it('usuario sin empresa/sucursal: devuelve null en esos nombres y nunca la contrasena', async () => {
    const r = await service.listarConNombres(tA);
    expect(r[0]).toMatchObject({ tenantNombre: 'Negocio A', empresaNombre: null, sucursalNombre: null });
    expect(JSON.stringify(r)).not.toMatch(/password/i);
  });

  it('ids de tipos distintos (varchar vs uuid) no rompen el join', async () => {
    // user.tenantId/companyId/branchId son varchar y tenant.id/company.id/branch.id son uuid: el ::text los iguala.
    const cols = await ds.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('user','tenant') AND column_name IN ('id','tenantId') ORDER BY table_name, column_name`,
      [schema],
    );
    expect(cols.map((c: any) => c.data_type)).toEqual(expect.arrayContaining(['uuid', 'character varying']));
    expect((await service.listarConNombres(tA)).length).toBe(2);
  });
});
