import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { Patient } from './entities/patient.entity';
import { Consulta } from './entities/consulta.entity';
import { OcrService } from '../ocr/ocr.service';
import { OcrDocument } from '../ocr/entities/ocr-document.entity';
import { IntegrationsService } from '../integrations/integrations.service';
import { IntegrationsController } from '../integrations/integrations.controller';
import { Integration } from '../integrations/entities/integration.entity';
import { AppointmentsController } from '../appointments/appointments.controller';

dotenv.config();

// Pacientes (datos clinicos), OCR, integraciones y citas contra Postgres real (esquema temporal). Antes: GET /patients con
// un token sin tenant devolvia los expedientes de TODOS los negocios (TypeORM ignora una condicion con valor undefined),
// GET/PUT /patients/:id leian y editaban cualquier expediente por id, una consulta sumaba visitas al paciente de otro
// negocio, y el OCR/integraciones/citas aceptaban tokens sin tenant (o x-tenant-id) como si fueran de cualquier negocio.
describe('Pacientes, OCR, integraciones y citas: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_pac_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let patients: PatientsService;
  let ocr: OcrService;
  let integ: IntegrationsService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let patA: string;
  let slugA: string;

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
  const noEncontrado = (p: Promise<any>) => expect(p).rejects.toBeInstanceOf(NotFoundException);

  beforeAll(async () => {
    const admin = await new DataSource(base()).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.destroy();
    ds = await new DataSource({ ...base(), schema, synchronize: true, entities: [Patient, Consulta, OcrDocument, Integration] }).initialize();

    patA = await guardar(Patient, { tenantId: tA, nombre: 'Paciente A', numeroVisitas: 0 });
    await guardar(Consulta, { tenantId: tA, patientId: patA, doctor: 'Dr. A', tratamiento: 'Limpieza' });
    await guardar(OcrDocument, { tenantId: tA, fileName: 'a.pdf', status: 'PENDING' });

    patients = new PatientsService(ds.getRepository(Patient), ds.getRepository(Consulta));
    ocr = Object.create(OcrService.prototype);
    (ocr as any).repo = ds.getRepository(OcrDocument);
    integ = Object.create(IntegrationsService.prototype);
    (integ as any).repo = ds.getRepository(Integration);
    // una integracion activa de A, con el primer slug del catalogo
    slugA = (await integ.findAll(tA))[0].slug;
    await guardar(Integration, { tenantId: tA, slug: slugA, credentials: 'x', isActive: true });
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve y opera sus pacientes', async () => {
    expect((await patients.findAll(tA)).map((p) => p.nombre)).toEqual(['Paciente A']);
    expect((await patients.findOne(patA, tA)).nombre).toBe('Paciente A');
    expect((await patients.findConsultas(tA, patA)).length).toBe(1);
    expect((await ocr.findAll(tA)).length).toBe(1);
  });

  it('listados: B y "sin tenant" no ven nada (antes sin tenant se devolvia el expediente de todos los negocios)', async () => {
    for (const t of [tB, undefined as any]) {
      expect(await patients.findAll(t)).toEqual([]);
      expect(await patients.findConsultas(t)).toEqual([]);
      expect(await ocr.findAll(t)).toEqual([]);
    }
    // Integraciones: sin tenant nada; B ve el catalogo pero ninguna integracion activa (la de A no aparece como suya)
    expect(await integ.findAll(undefined as any)).toEqual([]);
    const deB = await integ.findAll(tB);
    expect(deB.length).toBeGreaterThan(0);
    expect(deB.every((i: any) => i.isActive === false && i.id === null)).toBe(true);
    expect((await integ.findAll(tA)).some((i: any) => i.slug === slugA && i.isActive === true)).toBe(true);
  });

  it('por id: B no lee ni edita el expediente de A, ni le suma consultas (404)', async () => {
    await noEncontrado(patients.findOne(patA, tB));
    await noEncontrado(patients.update(patA, { nombre: 'Hackeado' }, tB));
    await noEncontrado(patients.findOne(patA, undefined as any));
    await noEncontrado(patients.createConsulta({ tenantId: tB, patientId: patA, doctor: 'Dr. B', tratamiento: 'X' } as any));
    expect(await ds.getRepository(Patient).findOneBy({ id: patA })).toMatchObject({ nombre: 'Paciente A', numeroVisitas: 0 });
    expect(await ds.getRepository(Consulta).count()).toBe(1);
  });

  it('altas: sin tenant 400, el id del body no pisa el expediente y update no cambia el negocio', async () => {
    await expect(patients.create({ nombre: 'X' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(patients.createConsulta({ patientId: patA } as any)).rejects.toBeInstanceOf(BadRequestException);
    const p: any = await patients.create({ id: patA, tenantId: tB, nombre: 'Paciente B' } as any);
    expect(p.id).not.toBe(patA);
    expect(await ds.getRepository(Patient).findOneBy({ id: patA })).toMatchObject({ tenantId: tA, nombre: 'Paciente A' });
    await patients.update(patA, { tenantId: tB, nombre: 'Editado' } as any, tA);
    expect(await ds.getRepository(Patient).findOneBy({ id: patA })).toMatchObject({ tenantId: tA, nombre: 'Editado' });
  });

  it('A registra consulta de su paciente: suma visita', async () => {
    await patients.createConsulta({ tenantId: tA, patientId: patA, doctor: 'Dr. A', tratamiento: 'Revision' } as any);
    expect(Number((await ds.getRepository(Patient).findOneBy({ id: patA }))!.numeroVisitas)).toBe(1);
  });

  it('controladores: tenant del token (query ignorado), SOPORTE con ?tenantId=, token sin tenant 403 (pacientes, citas, integraciones, OCR)', async () => {
    const psvc: any = { findAll: jest.fn(), findOne: jest.fn() };
    const pc = new PatientsController(psvc);
    expect(() => pc.findAll({ user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    pc.findAll({ user: { roleCode: 'ADMIN', tenantId: tA, companyId: 'c' }, query: { tenantId: tB } });
    expect(psvc.findAll.mock.calls[0][0]).toBe(tA);
    pc.findAll({ user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(psvc.findAll.mock.calls[1][0]).toBe(tB);
    expect(() => pc.findAll({ user: { roleCode: 'SOPORTE' }, query: {} })).toThrow(BadRequestException);
    pc.findOne('id', { user: { roleCode: 'ADMIN', tenantId: tA }, query: {} });
    expect(psvc.findOne).toHaveBeenCalledWith('id', tA);

    const asvc: any = { findOne: jest.fn() };
    const ac = new AppointmentsController(asvc);
    expect(() => ac.findOne('id', { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    ac.findOne('id', { user: { roleCode: 'ADMIN', tenantId: tA }, query: {} });
    expect(asvc.findOne).toHaveBeenCalledWith('id', tA);

    const isvc: any = { findAll: jest.fn() };
    const ic = new IntegrationsController(isvc);
    expect(() => ic.findAll({ user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    ic.findAll({ user: { roleCode: 'ADMIN', tenantId: tA }, query: {} });
    expect(isvc.findAll.mock.calls[0][0]).toBe(tA);
  });
});
