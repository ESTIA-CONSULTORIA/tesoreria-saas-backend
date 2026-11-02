import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { of, lastValueFrom } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditLog } from './audit.entity';
import { entidadDeLaUrl, negocioDeLaBitacora } from './tenant-objetivo';

dotenv.config();

const tA = '11111111-1111-4111-8111-111111111111';
const tB = '22222222-2222-4222-8222-222222222222';

describe('negocioDeLaBitacora (unidad)', () => {
  it('un usuario de negocio siempre queda con el tenant de su token, aunque mande ?tenantId= o body.tenantId de otro', () => {
    expect(negocioDeLaBitacora({ roleCode: 'ADMIN', tenantIdToken: tA, query: { tenantId: tB }, body: { tenantId: tB }, respuesta: { tenantId: tB } })).toEqual({ tenantId: tA, origen: 'token' });
  });

  it('SOPORTE: negocio objetivo por ?tenantId=, luego body.tenantId, luego el tenantId de la respuesta (en ese orden)', () => {
    expect(negocioDeLaBitacora({ roleCode: 'SOPORTE', query: { tenantId: tB }, body: { tenantId: tA }, respuesta: { tenantId: tA } })).toEqual({ tenantId: tB, origen: 'query' });
    expect(negocioDeLaBitacora({ roleCode: 'SOPORTE', query: {}, body: { tenantId: tB }, respuesta: { tenantId: tA } })).toEqual({ tenantId: tB, origen: 'body' });
    expect(negocioDeLaBitacora({ roleCode: 'SOPORTE', query: {}, body: {}, respuesta: { tenantId: tB } })).toEqual({ tenantId: tB, origen: 'respuesta' });
  });

  it('sin negocio objetivo, o con un valor que no es UUID, queda como system (no se inventa un negocio)', () => {
    expect(negocioDeLaBitacora({ roleCode: 'SOPORTE' })).toEqual({ tenantId: 'system', origen: 'sistema' });
    expect(negocioDeLaBitacora({ roleCode: 'SOPORTE', query: { tenantId: 'todos' }, body: { tenantId: "x'; DROP" }, respuesta: { tenantId: 123 } })).toEqual({ tenantId: 'system', origen: 'sistema' });
    expect(negocioDeLaBitacora({ roleCode: null })).toEqual({ tenantId: 'system', origen: 'sistema' });
  });

  it('un rol que no es SOPORTE y no trae tenant (sin sesion) no puede escribir en el negocio que pida', () => {
    expect(negocioDeLaBitacora({ roleCode: 'ADMIN', tenantIdToken: null, query: { tenantId: tB } })).toEqual({ tenantId: 'system', origen: 'sistema' });
    expect(negocioDeLaBitacora({ roleCode: undefined, query: { tenantId: tB } })).toEqual({ tenantId: 'system', origen: 'sistema' });
  });
});

describe('entidadDeLaUrl (unidad)', () => {
  it('ignora /api/v1 (antes casi todo quedaba como entidad «Api») y singulariza', () => {
    expect(entidadDeLaUrl('/api/v1/users')).toBe('User');
    expect(entidadDeLaUrl('/api/v1/users/abc?x=1')).toBe('User');
    expect(entidadDeLaUrl('/api/v1/companies')).toBe('Company');
    expect(entidadDeLaUrl('/users')).toBe('User');
    expect(entidadDeLaUrl('/api/v2/branches/9')).toBe('Branch');
    expect(entidadDeLaUrl('/')).toBe('Unknown');
  });
});

// La bitacora contra Postgres real: interceptor + servicio + controlador reales. Antes, SOPORTE quedaba siempre con tenantId
// 'system' y el ADMIN del negocio afectado no veia lo que SOPORTE hizo en su negocio.
describe('Bitacora: SOPORTE registra el negocio objetivo (Postgres real)', () => {
  const schema = `test_bitacora_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let interceptor: AuditInterceptor;
  let controlador: AuditController;

  const base = () => ({
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'estia',
  });
  const ejecutar = async (req: any, respuesta: any = { ok: true }) => {
    const contexto = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 200 }) }) } as any;
    await lastValueFrom(interceptor.intercept(contexto, { handle: () => of(respuesta) } as any));
    await new Promise((r) => setTimeout(r, 80)); // el registro se escribe en un tap asincrono
  };
  const vistaDe = async (user: any, query: any = {}) => {
    const r: any = await controlador.findAll({ user, query } as any);
    return (r?.data ?? r) as AuditLog[];
  };
  const soporte = { id: 'sop-1', email: 'soporte@estia.mx', roleCode: 'SOPORTE' };
  const adminA = { id: 'adm-a', email: 'admin-a@x.mx', roleCode: 'ADMIN', tenantId: tA };
  const adminB = { id: 'adm-b', email: 'admin-b@x.mx', roleCode: 'ADMIN', tenantId: tB };

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [AuditLog] }).initialize();
    const servicio = new AuditService(ds.getRepository(AuditLog));
    interceptor = new AuditInterceptor(servicio);
    controlador = new AuditController(servicio);
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('SOPORTE con ?tenantId= (selector de negocio): la entrada es del negocio B, con entidad User y marca del origen', async () => {
    await ejecutar({ method: 'POST', url: `/api/v1/users?tenantId=${tB}`, query: { tenantId: tB }, user: soporte, body: { email: 'nuevo@x.mx', password: 'Secreta1' }, headers: {}, ip: '1.1.1.1' });
    const fila = (await ds.getRepository(AuditLog).find({ where: { userId: 'sop-1' } }))[0];
    expect(fila).toMatchObject({ tenantId: tB, roleCode: 'SOPORTE', action: 'CREATE', entity: 'User' });
    expect(fila.details).toMatchObject({ negocioObjetivo: 'query' });
    expect(JSON.stringify(fila.details)).not.toContain('Secreta1');
  });

  it('SOPORTE por ruta con id (sin ?tenantId=): toma el negocio de la respuesta', async () => {
    await ejecutar({ method: 'PUT', url: '/api/v1/users/abc', query: {}, user: soporte, body: { name: 'X' }, headers: {}, ip: '1.1.1.1' }, { id: 'abc', tenantId: tA });
    const fila = await ds.getRepository(AuditLog).findOne({ where: { userId: 'sop-1', action: 'UPDATE' } });
    expect(fila).toMatchObject({ tenantId: tA });
    expect(fila!.details).toMatchObject({ negocioObjetivo: 'respuesta' });
  });

  it('el ADMIN del negocio B ve lo que SOPORTE hizo en su negocio; el de A no lo ve', async () => {
    const deB = await vistaDe(adminB);
    expect(deB.some((l) => l.roleCode === 'SOPORTE' && l.entity === 'User' && l.action === 'CREATE')).toBe(true);
    expect(deB.every((l) => l.tenantId === tB)).toBe(true);
    const deA = await vistaDe(adminA);
    expect(deA.some((l) => l.roleCode === 'SOPORTE' && l.action === 'CREATE')).toBe(false); // el alta fue en B
    expect(deA.some((l) => l.roleCode === 'SOPORTE' && l.action === 'UPDATE')).toBe(true); // la edicion fue en A
  });

  it('un ADMIN no puede escribir en la bitacora de otro negocio mandando ?tenantId= (queda en el suyo)', async () => {
    await ejecutar({ method: 'POST', url: `/api/v1/companies?tenantId=${tB}`, query: { tenantId: tB }, user: adminA, body: { tenantId: tB, tradeName: 'X' }, headers: {}, ip: '2.2.2.2' });
    const fila = await ds.getRepository(AuditLog).findOne({ where: { userId: 'adm-a', entity: 'Company' } });
    expect(fila!.tenantId).toBe(tA);
    expect((fila!.details as any).negocioObjetivo).toBeUndefined();
    expect((await vistaDe(adminB)).some((l) => l.userId === 'adm-a')).toBe(false);
  });

  it('SOPORTE sin negocio objetivo (o con un valor que no es UUID): system, como antes; la vista global de SOPORTE los ve todos', async () => {
    await ejecutar({ method: 'POST', url: '/api/v1/tenants', query: { tenantId: 'todos' }, user: soporte, body: {}, headers: {}, ip: '1.1.1.1' }, { ok: true });
    const fila = await ds.getRepository(AuditLog).findOne({ where: { userId: 'sop-1', entity: 'Tenant' } });
    expect(fila!.tenantId).toBe('system');
    const global = await vistaDe(soporte);
    expect(global.some((l) => l.tenantId === 'system')).toBe(true);
    expect(global.some((l) => l.tenantId === tA)).toBe(true);
    expect(global.some((l) => l.tenantId === tB)).toBe(true);
    // y SOPORTE puede acotar por negocio
    expect((await vistaDe(soporte, { tenantId: tB })).every((l) => l.tenantId === tB)).toBe(true);
  });
});
