import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ModulesService } from './modules.service';
import { ModulesController } from './modules.controller';
import { Module as ModuleEntity } from './entities/module.entity';
import { PlanModule } from './entities/plan-module.entity';
import { TenantModule } from './entities/tenant-module.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// initFromPlan con limitarA (uso interno de la prueba pública): el plan es el techo, limitarA solo resta y el giro sigue filtrando.
describe('initFromPlan — limitarA', () => {
  const PLAN = ['dashboard', 'pos', 'costos', 'membresias', 'tesoreria'].map((moduleCode) => ({ planCode: 'PRUEBA', moduleCode, included: true }));
  const montar = async (giro: string) => {
    const guardados: any[] = [];
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        ModulesService,
        { provide: getRepositoryToken(ModuleEntity), useValue: {} },
        { provide: getRepositoryToken(PlanModule), useValue: { find: jest.fn(() => Promise.resolve(PLAN)) } },
        { provide: getRepositoryToken(TenantModule), useValue: { findOne: jest.fn(() => Promise.resolve(null)), create: jest.fn((x: any) => x), save: jest.fn((x: any) => { guardados.push(x.moduleCode); return Promise.resolve(x); }) } },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn(() => Promise.resolve({ id: 't', giro })) } },
      ],
    }).compile();
    return { service: m.get(ModulesService), guardados };
  };

  it('sin limitarA activa todo lo del plan que el giro permite (comportamiento de siempre)', async () => {
    const { service, guardados } = await montar('generico');
    await service.initFromPlan('t', 'PRUEBA', 'generico');
    expect(guardados).toEqual(['dashboard', 'pos', 'costos', 'tesoreria']);
  });

  it('con limitarA activa solo la intersección con el plan: lo que el plan no tiene no se activa aunque se pida', async () => {
    const { service, guardados } = await montar('gimnasio');
    await service.initFromPlan('t', 'PRUEBA', 'gimnasio', ['dashboard', 'membresias', 'compras', 'rh']);
    expect(guardados).toEqual(['dashboard', 'membresias']);
  });

  it('limitarA no salta el filtro de giro: pedir membresías para un restaurante no la activa', async () => {
    const { service, guardados } = await montar('restaurante');
    await service.initFromPlan('t', 'PRUEBA', 'restaurante', ['pos', 'membresias']);
    expect(guardados).toEqual(['pos']);
  });
});

// El catálogo de módulos (Centro de Soluciones) solo muestra a cada negocio lo que su giro le permite activar.
const CATALOGO = ['pos', 'costos', 'pacientes', 'membresias'].map((code) => ({ code, name: code, isActive: true }));
const GIROS: Record<string, string> = { gym: 'gimnasio', resto: 'restaurante', clinica: 'medico_dental' };

describe('GET /modules — catálogo filtrado por giro', () => {
  let service: ModulesService;
  let controller: ModulesController;

  beforeEach(async () => {
    const m: TestingModule = await Test.createTestingModule({
      controllers: [ModulesController],
      providers: [
        ModulesService,
        { provide: getRepositoryToken(ModuleEntity), useValue: { find: jest.fn(() => Promise.resolve(CATALOGO.map((c) => ({ ...c })))) } },
        { provide: getRepositoryToken(PlanModule), useValue: {} },
        { provide: getRepositoryToken(TenantModule), useValue: {} },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn(({ where }: any) => Promise.resolve(GIROS[where.id] ? { id: where.id, giro: GIROS[where.id] } : null)) } },
      ],
    }).compile();
    service = m.get(ModulesService);
    controller = m.get(ModulesController);
  });

  const codes = (r: any[]) => r.map((x) => x.code);

  it('un gimnasio ve Membresías (y no Pacientes)', async () => {
    expect(codes(await service.getAllModules('gym'))).toEqual(['pos', 'costos', 'membresias']);
  });

  it('un restaurante NO ve Membresías ni Pacientes', async () => {
    expect(codes(await service.getAllModules('resto'))).toEqual(['pos', 'costos']);
  });

  it('una clínica ve Pacientes y no Membresías', async () => {
    expect(codes(await service.getAllModules('clinica'))).toEqual(['pos', 'costos', 'pacientes']);
  });

  it('un tenant que no existe se trata como genérico (el catálogo más restrictivo)', async () => {
    expect(codes(await service.getAllModules('fantasma'))).toEqual(['pos', 'costos']);
  });

  it('el controller: SOPORTE ve todo el catálogo; un usuario ve solo el de su giro', async () => {
    expect(codes(await controller.getAllModules({ user: { roleCode: 'SOPORTE' } } as any))).toEqual(['pos', 'costos', 'pacientes', 'membresias']);
    expect(codes(await controller.getAllModules({ user: { roleCode: 'ADMIN', tenantId: 'resto' } } as any))).toEqual(['pos', 'costos']);
    expect(codes(await controller.getAllModules({ user: { roleCode: 'RECEPCION', tenantId: 'gym' } } as any))).toEqual(['pos', 'costos', 'membresias']);
  });
});
