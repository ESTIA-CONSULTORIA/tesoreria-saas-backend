import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AreasService } from './areas.service';
import { AreasController } from './areas.controller';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { Area } from './entities/area.entity';
import { Table } from './entities/table.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

// GET /pos/areas devolvía, SIN sucursal en la petición (token POS Lite, ADMIN sin sucursal), las áreas
// con sus mesas de TODOS los tenants. Ahora siempre filtra por las sucursales del tenant. También: el
// filtro de sucursal de GET /pos/tables nunca llegaba (@Param de una ruta sin params) y áreas/mesas
// podían crearse apuntando a sucursales/áreas de otro tenant.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

describe('AreasService / TablesService — aislamiento por tenant', () => {
  let areas: AreasService;
  let areasRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock };

  const COMPANIES = [
    { id: 'co-A', tenantId: TENANT_A },
    { id: 'co-B', tenantId: TENANT_B },
  ];
  const BRANCHES = [
    { id: 'suc-A1', companyId: 'co-A' },
    { id: 'suc-A2', companyId: 'co-A' },
    { id: 'suc-B1', companyId: 'co-B' },
  ];
  const AREAS = [
    { id: 'area-A1', branchId: 'suc-A1', name: 'Terraza', tables: [{ id: 'm1', tenantId: TENANT_A }, { id: 'm-colada', tenantId: TENANT_B }] },
    { id: 'area-A2', branchId: 'suc-A2', name: 'Salón', tables: [{ id: 'm2', tenantId: TENANT_A }] },
    { id: 'area-B1', branchId: 'suc-B1', name: 'Barra B', tables: [{ id: 'm3', tenantId: TENANT_B }] },
  ];
  // El filtro `In(...)` de TypeORM llega como FindOperator con _value; el fake lo respeta.
  const matchBranch = (a: any, where: any) => {
    const b = where?.branchId;
    if (b === undefined) return true;
    if (b && typeof b === 'object' && '_value' in b) return b._value.includes(a.branchId);
    return a.branchId === b;
  };

  beforeEach(async () => {
    areasRepo = {
      find: jest.fn(({ where }: any) => Promise.resolve(AREAS.filter((a) => matchBranch(a, where)).map((a) => ({ ...a, tables: [...a.tables] })))),
      findOne: jest.fn(({ where }: any) => Promise.resolve(AREAS.find((a) => a.id === where.id) ?? null)),
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ id: 'nueva', ...d })),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const companiesRepo = {
      find: jest.fn(({ where }: any) => Promise.resolve(COMPANIES.filter((c) => c.tenantId === where.tenantId))),
      findOne: jest.fn(({ where }: any) => Promise.resolve(COMPANIES.find((c) => c.id === where.id && (!where.tenantId || c.tenantId === where.tenantId)) ?? null)),
    };
    const branchesRepo = {
      find: jest.fn(({ where }: any) => Promise.resolve(BRANCHES.filter((b) => where.companyId._value.includes(b.companyId)))),
      findOne: jest.fn(({ where }: any) => Promise.resolve(BRANCHES.find((b) => b.id === where.id) ?? null)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AreasService,
        { provide: getRepositoryToken(Area), useValue: areasRepo },
        { provide: getRepositoryToken(Branch), useValue: branchesRepo },
        { provide: getRepositoryToken(Company), useValue: companiesRepo },
      ],
    }).compile();
    areas = module.get(AreasService);
  });

  describe('GET /pos/areas — findAll()', () => {
    it('sin sucursal en la petición: solo las áreas de las sucursales del tenant (antes: de todos)', async () => {
      const r = await areas.findAll(undefined, TENANT_A);
      expect(r.map((a: any) => a.id).sort()).toEqual(['area-A1', 'area-A2']);
    });

    it('el otro tenant ve solo lo suyo', async () => {
      const r = await areas.findAll(undefined, TENANT_B);
      expect(r.map((a: any) => a.id)).toEqual(['area-B1']);
    });

    it('con sucursal propia: solo esa sucursal', async () => {
      const r = await areas.findAll('suc-A2', TENANT_A);
      expect(r.map((a: any) => a.id)).toEqual(['area-A2']);
    });

    it('con una sucursal de OTRO tenant: vacío (no la ajena)', async () => {
      await expect(areas.findAll('suc-B1', TENANT_A)).resolves.toEqual([]);
    });

    it('tenant sin empresas ni sucursales: vacío', async () => {
      await expect(areas.findAll(undefined, 'tenant-C')).resolves.toEqual([]);
    });

    it('una mesa de otro tenant colgada de un área propia no se muestra', async () => {
      const r: any = await areas.findAll('suc-A1', TENANT_A);
      expect(r[0].tables.map((t: any) => t.id)).toEqual(['m1']);
    });

    it('SOPORTE (sin tenant) conserva el comportamiento anterior', async () => {
      const r = await areas.findAll(undefined, undefined);
      expect(r).toHaveLength(3);
    });
  });

  describe('alta y edición con pertenencia', () => {
    it('crear un área en una sucursal de OTRO tenant: 400 y no guarda', async () => {
      await expect(areas.create({ name: 'X', branchId: 'suc-B1' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      expect(areasRepo.save).not.toHaveBeenCalled();
    });

    it('crear un área sin sucursal con tenant: 400; en una sucursal propia: ok', async () => {
      await expect(areas.create({ name: 'X' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(areas.create({ name: 'X', branchId: 'suc-A1' } as any, TENANT_A)).resolves.toBeDefined();
    });

    it('mover un área propia a una sucursal ajena: 400', async () => {
      await expect(areas.update('area-A1', { branchId: 'suc-B1' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      expect(areasRepo.update).not.toHaveBeenCalled();
    });

    it('assertAreaOwned: un área ajena o inexistente: 400', async () => {
      await expect(areas.assertAreaOwned('area-B1', TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(areas.assertAreaOwned('nope', TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(areas.assertAreaOwned('area-A1', TENANT_A)).resolves.toBeUndefined();
    });
  });

  describe('controllers', () => {
    it('AreasController.findAll pasa el tenant del JWT (aunque no haya sucursal)', async () => {
      const service = { findAll: jest.fn().mockResolvedValue([]) };
      const m = await Test.createTestingModule({ controllers: [AreasController], providers: [{ provide: AreasService, useValue: service }] }).compile();
      await m.get(AreasController).findAll({ user: { tenantId: TENANT_A } }, undefined);
      expect(service.findAll).toHaveBeenCalledWith(undefined, TENANT_A);
      await m.get(AreasController).findAll({ user: { tenantId: TENANT_A, branchId: 'suc-A1' } }, 'suc-A2');
      expect(service.findAll).toHaveBeenLastCalledWith('suc-A2', TENANT_A);
    });

    it('TablesController.findAll: el filtro de sucursal llega por query o por header x-branch-id', async () => {
      const service = { findAll: jest.fn().mockResolvedValue([]) };
      const m = await Test.createTestingModule({ controllers: [TablesController], providers: [{ provide: TablesService, useValue: service }] }).compile();
      const c = m.get(TablesController);
      await c.findAll({ user: { tenantId: TENANT_A } }, 'suc-A1', 'area-A1', undefined);
      expect(service.findAll).toHaveBeenLastCalledWith('suc-A1', 'area-A1', TENANT_A);
      await c.findAll({ user: { tenantId: TENANT_A } }, undefined, undefined, 'suc-A2');
      expect(service.findAll).toHaveBeenLastCalledWith('suc-A2', undefined, TENANT_A);
    });
  });

  describe('TablesService — mesas con sucursal/área propias', () => {
    it('crear o mover una mesa a un área o sucursal de OTRO tenant: 400 y no guarda', async () => {
      const tablesRepo = { create: jest.fn((d) => d), save: jest.fn((d) => Promise.resolve(d)), findOne: jest.fn().mockResolvedValue({ id: 'm1', tenantId: TENANT_A }), update: jest.fn(), find: jest.fn() };
      const m = await Test.createTestingModule({
        providers: [TablesService, { provide: getRepositoryToken(Table), useValue: tablesRepo }, { provide: AreasService, useValue: areas }],
      }).compile();
      const tables = m.get(TablesService);
      await expect(tables.create({ number: 1, branchId: 'suc-B1' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(tables.create({ number: 1, branchId: 'suc-A1', areaId: 'area-B1' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      await expect(tables.update('m1', { areaId: 'area-B1' } as any, TENANT_A)).rejects.toThrow(BadRequestException);
      expect(tablesRepo.save).not.toHaveBeenCalled();
      expect(tablesRepo.update).not.toHaveBeenCalled();
      await expect(tables.create({ number: 1, branchId: 'suc-A1', areaId: 'area-A1' } as any, TENANT_A)).resolves.toBeDefined();
    });
  });
});
