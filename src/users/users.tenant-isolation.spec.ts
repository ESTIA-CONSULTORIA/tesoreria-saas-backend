import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// Auditoría BUSINESS (hallazgo transversal #6): update()/remove()/updateCompany() no
// filtraban por tenant en absoluto — un ADMIN de un tenant podía cambiar rol/contraseña/
// estado, reasignar empresa, o borrar un usuario de OTRO tenant si conocía su id.
describe('UsersService — aislamiento por tenant', () => {
  let service: UsersService;
  let usersRepo: { findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let tenantRepo: { findOne: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';
  const USER_B = 'user-B';

  function fakeUserLookup(where: { id: string; tenantId?: string }) {
    if (where.id !== USER_B) return Promise.resolve(null);
    if (where.tenantId && where.tenantId !== TENANT_B) return Promise.resolve(null);
    return Promise.resolve({ id: USER_B, tenantId: TENANT_B, roleCode: 'USER', companyId: null, branchId: null });
  }

  beforeEach(async () => {
    usersRepo = {
      findOne: jest.fn(({ where }) => fakeUserLookup(where)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    tenantRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('update()', () => {
    it('rechaza editar (rol/contraseña/estado) un usuario de OTRO tenant', async () => {
      await expect(
        service.update(USER_B, { roleCode: 'ADMIN' }, { roleCode: 'ADMIN', tenantId: TENANT_A }),
      ).rejects.toThrow();
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('permite editar un usuario del MISMO tenant', async () => {
      await expect(
        service.update(USER_B, { name: 'nuevo nombre' }, { roleCode: 'ADMIN', tenantId: TENANT_B }),
      ).resolves.toBeDefined();
      expect(usersRepo.update).toHaveBeenCalled();
    });

    it('SOPORTE (sin tenantId propio) conserva acceso total', async () => {
      await expect(
        service.update(USER_B, { name: 'nuevo nombre' }, { roleCode: 'SOPORTE', tenantId: undefined }),
      ).resolves.toBeDefined();
      expect(usersRepo.update).toHaveBeenCalled();
    });
  });

  describe('updateCompany()', () => {
    it('rechaza reasignar la empresa de un usuario de OTRO tenant', async () => {
      await expect(service.updateCompany(USER_B, 'company-x', TENANT_A)).rejects.toThrow();
      expect(usersRepo.update).not.toHaveBeenCalled();
    });

    it('permite reasignar la empresa de un usuario del MISMO tenant', async () => {
      await expect(service.updateCompany(USER_B, 'company-x', TENANT_B)).resolves.toBeDefined();
    });
  });

  describe('remove()', () => {
    it('rechaza borrar un usuario de OTRO tenant', async () => {
      await expect(service.remove(USER_B, TENANT_A)).rejects.toThrow();
      expect(usersRepo.delete).not.toHaveBeenCalled();
    });

    it('permite borrar un usuario del MISMO tenant', async () => {
      await expect(service.remove(USER_B, TENANT_B)).resolves.toBeDefined();
      expect(usersRepo.delete).toHaveBeenCalledWith(USER_B);
    });
  });

});

// GET /users/role/:roleCode tomaba el tenantId directo de un query param controlable por el
// cliente, sin mirar el JWT — un ADMIN de tenant-A podía listar los ADMIN/emails de tenant-B
// con solo mandar ?tenantId=tenant-B. La prioridad "JWT antes que query" vive en el
// controller (mismo patrón que findAll()/create() en otros módulos ya corregidos).
describe('UsersController — prioridad tenantId JWT sobre query (findByRole)', () => {
  let controller: UsersController;
  let service: { findByRole: jest.Mock };

  const TENANT_A = 'tenant-A';
  const TENANT_B = 'tenant-B';

  beforeEach(async () => {
    service = { findByRole: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();
    controller = module.get<UsersController>(UsersController);
  });

  it('ignora el tenantId de query cuando el JWT trae uno propio', () => {
    controller.findByRole('ADMIN', TENANT_B, { user: { tenantId: TENANT_A } } as any);
    expect(service.findByRole).toHaveBeenCalledWith('ADMIN', TENANT_A);
  });

  it('usa el tenantId de query solo cuando el JWT no trae uno (SOPORTE)', () => {
    controller.findByRole('ADMIN', TENANT_B, { user: { tenantId: undefined } } as any);
    expect(service.findByRole).toHaveBeenCalledWith('ADMIN', TENANT_B);
  });
});
