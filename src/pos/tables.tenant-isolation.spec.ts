import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { Table } from './entities/table.entity';
import { AreasService } from './areas.service';

// Capacidad mesas_cuenta_abierta (aislamiento de tenant desde el día uno): TablesController no
// tomaba el tenant del JWT al crear (mesa huérfana si el body no lo traía — en producción había 11
// mesas con tenantId NULL), update() dejaba reasignar la mesa mandando tenantId en el body, y
// findAll() devolvía las mesas de TODOS los tenants.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

describe('TablesService — aislamiento por tenant', () => {
  let service: TablesService;
  let tablesRepo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    tablesRepo = {
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ id: 'nueva', ...d })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(({ where }) => {
        if (where.id !== 'mesa-A') return Promise.resolve(null);
        if (where.tenantId && where.tenantId !== TENANT_A) return Promise.resolve(null);
        return Promise.resolve({ id: 'mesa-A', tenantId: TENANT_A });
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: getRepositoryToken(Table), useValue: tablesRepo },
        { provide: AreasService, useValue: { assertBranchOwned: jest.fn().mockResolvedValue(undefined), assertAreaOwned: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();
    service = module.get(TablesService);
  });

  describe('findAll()', () => {
    it('filtra por el tenant del JWT (antes devolvía las mesas de todos los tenants)', async () => {
      await service.findAll(undefined, undefined, TENANT_A);
      expect(tablesRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: TENANT_A } }));
    });

    it('combina tenant con sucursal/área cuando vienen', async () => {
      await service.findAll('branch-1', 'area-1', TENANT_A);
      expect(tablesRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { branchId: 'branch-1', areaId: 'area-1', tenantId: TENANT_A } }));
    });

    it('SOPORTE (sin tenantId): conserva la vista completa', async () => {
      await service.findAll();
      expect(tablesRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    });
  });

  describe('create()', () => {
    it('impone el tenantId resuelto sobre el que traiga el body', async () => {
      await service.create({ number: 5, tenantId: TENANT_B } as any, TENANT_A);
      expect(tablesRepo.save).toHaveBeenCalledWith(expect.objectContaining({ number: 5, tenantId: TENANT_A }));
    });

    it('sin tenant resuelto: rechaza y no guarda (no pueden existir mesas huérfanas)', () => {
      expect(() => service.create({ number: 5 } as any, undefined)).toThrow(BadRequestException);
      expect(() => service.create({ number: 5, tenantId: null } as any, '')).toThrow(BadRequestException);
      expect(tablesRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('descarta tenantId e id del body: no se puede reasignar la mesa a otro tenant ni dejarla huérfana', async () => {
      await service.update('mesa-A', { capacity: 8, tenantId: TENANT_B, id: 'otra' } as any, TENANT_A);
      const [id, payload] = tablesRepo.update.mock.calls[0];
      expect(id).toBe('mesa-A');
      expect(payload).toEqual(expect.objectContaining({ capacity: 8 }));
      expect(payload).not.toHaveProperty('tenantId');
      expect(payload).not.toHaveProperty('id');
      await service.update('mesa-A', { tenantId: null } as any, TENANT_A);
      expect(tablesRepo.update.mock.calls[1][1]).not.toHaveProperty('tenantId');
    });

    it('mesa de otro tenant: NotFoundException y no actualiza', async () => {
      await expect(service.update('mesa-A', { capacity: 1 } as any, TENANT_B)).rejects.toThrow(NotFoundException);
      expect(tablesRepo.update).not.toHaveBeenCalled();
    });

    it('SOPORTE: conserva acceso, pero la mesa debe existir', async () => {
      await expect(service.update('mesa-A', { capacity: 2 } as any, undefined)).resolves.toBeDefined();
      await expect(service.update('no-existe', { capacity: 2 } as any, undefined)).rejects.toThrow(NotFoundException);
    });
  });
});

describe('TablesController — resolución del tenant', () => {
  let controller: TablesController;
  let service: { create: jest.Mock; findAll: jest.Mock };

  beforeEach(async () => {
    service = { create: jest.fn(), findAll: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [{ provide: TablesService, useValue: service }],
    }).compile();
    controller = module.get(TablesController);
  });

  it('create: el tenantId del JWT gana sobre el del body; SOPORTE usa body.tenantId; sin ninguno pasa undefined', () => {
    controller.create({ number: 1, tenantId: TENANT_B }, { user: { tenantId: TENANT_A } });
    expect(service.create).toHaveBeenLastCalledWith(expect.anything(), TENANT_A);
    controller.create({ number: 1, tenantId: TENANT_B }, { user: {} });
    expect(service.create).toHaveBeenLastCalledWith(expect.anything(), TENANT_B);
    controller.create({ number: 1 }, { user: {} });
    expect(service.create).toHaveBeenLastCalledWith(expect.anything(), undefined);
  });

  it('findAll: pasa el tenant del JWT al servicio', () => {
    controller.findAll({ user: { tenantId: TENANT_A } });
    expect(service.findAll).toHaveBeenCalledWith(undefined, undefined, TENANT_A);
  });
});
