import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { Contract } from './entities/contract.entity';
import { ContractTemplate } from './entities/contract-template.entity';
import { Employee } from '../hr/entities/employee.entity';
import { Company } from '../companies/entities/company.entity';

dotenv.config();

// Contratos contra Postgres real (esquema temporal). Antes: con el header x-tenant-id un token sin tenant leia plantillas y
// contratos de cualquier tenant, y las rutas por id (borrar plantilla, firmar, PDF, constancia, generar) no miraban el
// tenant: se generaba un contrato con el expediente de cualquier empleado y se podia descargar el PDF de cualquier contrato.
describe('ContractsService: aislamiento entre tenants contra Postgres real', () => {
  const schema = `test_contracts_${process.pid}_${Date.now()}`;
  let ds: DataSource;
  let svc: ContractsService;
  const tA = '11111111-1111-4111-8111-111111111111';
  const tB = '22222222-2222-4222-8222-222222222222';
  let coA: string, coB: string, empA: string, tplA: string, tplGlobal: string, conA: string;

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
    // El servicio usa SQL crudo (employee, company) sin esquema: el search_path apunta al esquema temporal (y a public por uuid-ossp)
    ds = await new DataSource({
      ...base(), schema, synchronize: true, entities: [Contract, ContractTemplate, Employee, Company],
      extra: { options: `-c search_path=${schema},public` },
    }).initialize();

    coA = await guardar(Company, { tenantId: tA, tradeName: 'Empresa A' });
    coB = await guardar(Company, { tenantId: tB, tradeName: 'Empresa B' });
    empA = await guardar(Employee, { tenantId: tA, companyId: coA, nombre: 'Ana', status: 'ACTIVO' });
    tplA = await guardar(ContractTemplate, { tenantId: tA, companyId: coA, name: 'Plantilla A', fileType: 'DOCX', fileBase64: 'dGVzdA==', isGlobal: false, isActive: true, detectedFields: [] });
    tplGlobal = await guardar(ContractTemplate, { tenantId: 'GLOBAL', name: 'Global', fileType: 'DOCX', fileBase64: 'dGVzdA==', isGlobal: true, isActive: true, detectedFields: [] });
    conA = await guardar(Contract, { tenantId: tA, companyId: coA, employeeId: empA, templateId: tplA, fileType: 'DOCX', signatureLevel: 'SIMPLE', status: 'PENDIENTE' });

    const storage: any = { getOneByOwner: async () => null, getContent: async () => null, upload: async () => undefined };
    svc = new ContractsService(
      ds.getRepository(ContractTemplate), ds.getRepository(Contract), ds, storage, {} as any, { hasModule: async () => false } as any, {} as any,
    );
  });

  afterAll(async () => {
    if (!ds) return;
    await ds.destroy();
    const admin = await new DataSource(base()).initialize();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  });

  it('sanidad: A ve sus plantillas (y las globales) y sus contratos', async () => {
    expect((await svc.getTemplates(tA, coA)).map((t) => t.name).sort()).toEqual(['Global', 'Plantilla A']);
    expect((await svc.getContracts(tA)).length).toBe(1);
    expect((await svc.getContractPdf(conA, tA)).id).toBe(conA);
  });

  it('listados: B y "sin tenant" no ven plantillas ni contratos de A (solo las globales); X-Company-Id ajeno tampoco', async () => {
    expect((await svc.getTemplates(tB, coA)).map((t) => t.name)).toEqual(['Global']);
    expect((await svc.getTemplates(undefined, coA)).map((t) => t.name)).toEqual(['Global']);
    expect((await svc.getTemplates(tA, coB)).map((t) => t.name)).toEqual(['Global']);
    expect(await svc.getContracts(tB)).toEqual([]);
    expect(await svc.getContracts(undefined)).toEqual([]);
    expect(await svc.getContracts(tA, undefined, coB)).toEqual([]);
  });

  it('por id: B no borra la plantilla, ni descarga PDF o constancia, ni firma el contrato de A (404)', async () => {
    await noEncontrado(svc.deleteTemplate(tplA, tB));
    await noEncontrado(svc.getContractPdf(conA, tB));
    await noEncontrado(svc.getEvidencePdf(conA, tB));
    await noEncontrado(svc.signContract({ contractId: conA, signatureBase64: 'x', ip: '1.1.1.1' }, tB));
    expect((await ds.getRepository(ContractTemplate).findOneBy({ id: tplA }))!.isActive).toBe(true);
    expect((await ds.getRepository(Contract).findOneBy({ id: conA }))!.status).toBe('PENDIENTE');
  });

  it('plantillas globales no se borran (400), ni siquiera por SOPORTE', async () => {
    await expect(svc.deleteTemplate(tplGlobal, tB)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.deleteTemplate(tplGlobal, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generar contrato: B no puede usar la plantilla, el empleado ni la empresa de A', async () => {
    const d = { tenantId: tB, companyId: coB, employeeId: empA, templateId: tplA, signatureLevel: 'SIMPLE' };
    await noEncontrado(svc.generateContract(d)); // plantilla de A
    await noEncontrado(svc.generateContract({ ...d, templateId: tplGlobal })); // plantilla global si, pero empleado de A
    await noEncontrado(svc.generateContract({ ...d, templateId: tplGlobal, employeeId: empA, companyId: coA }));
    await expect(svc.generateContract({ ...d, tenantId: undefined as any })).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.getRepository(Contract).count()).toBe(1);
  });

  it('alta de plantilla: sin tenant 400, empresa ajena 404 y el id del body no pisa la plantilla de A', async () => {
    const dto = { name: 'Nueva', fileType: 'DOCX', fileBase64: 'dGVzdA==' };
    await expect(svc.uploadTemplate({ ...dto, tenantId: undefined as any, companyId: coB })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.uploadTemplate({ ...dto, tenantId: tB, companyId: coA })).rejects.toBeInstanceOf(NotFoundException);
    const t: any = await svc.uploadTemplate({ ...dto, id: tplA, tenantId: tB, companyId: coB } as any);
    expect(t.id).not.toBe(tplA);
    expect(await ds.getRepository(ContractTemplate).findOneBy({ id: tplA })).toMatchObject({ tenantId: tA, name: 'Plantilla A' });
  });

  it('A sigue operando con lo suyo (borrar su plantilla)', async () => {
    expect(await svc.deleteTemplate(tplA, tA)).toEqual({ deleted: true });
  });

  it('controlador: tenant del token (x-tenant-id y query ignorados), SOPORTE con ?tenantId=, token sin tenant 403', async () => {
    const service: any = { getTemplates: jest.fn(), getContracts: jest.fn(), uploadTemplate: jest.fn(), deleteTemplate: jest.fn(), getContractPdf: jest.fn() };
    const ctrl = new ContractsController(service);
    const admin = { user: { roleCode: 'ADMIN', tenantId: tA }, query: { tenantId: tB }, headers: { 'x-tenant-id': tB } };
    expect(() => ctrl.getTemplates(undefined as any, { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    ctrl.getTemplates(coB, admin);
    expect(service.getTemplates.mock.calls[0][0]).toBe(tA);
    ctrl.getTemplates(coB, { user: { roleCode: 'SOPORTE' }, query: { tenantId: tB } });
    expect(service.getTemplates.mock.calls[1][0]).toBe(tB);
    expect(() => ctrl.uploadTemplate({ name: 'x' }, coB, { user: { roleCode: 'SOPORTE' }, query: {} })).toThrow(BadRequestException);
    ctrl.uploadTemplate({ name: 'x', tenantId: tB }, coB, admin);
    expect(service.uploadTemplate.mock.calls[0][0].tenantId).toBe(tA);
    ctrl.deleteTemplate('id', admin);
    expect(service.deleteTemplate).toHaveBeenCalledWith('id', tA);
    ctrl.getContractPdf('id', admin);
    expect(service.getContractPdf).toHaveBeenCalledWith('id', tA);
    expect(() => ctrl.getContractPdf('id', { user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
  });
});
