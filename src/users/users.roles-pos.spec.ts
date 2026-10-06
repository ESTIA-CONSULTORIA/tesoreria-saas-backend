import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { RolesService } from '../roles/roles.service';
import { Role } from '../roles/entities/role.entity';
import { Permission } from '../roles/entities/permission.entity';
import { ROLES_CON_SUCURSAL, ROLES_NIP, ROLES_CAJA } from '../config/roles-pos.config';

// Roles CAPITAN y MESERO: operan sobre una sucursal, igual que CAJERO y GERENTE, así que exigen empresa y
// sucursal (regla de aplicación; la CHECK de BD solo cubre CAJERO/GERENTE). Los roles son globales.
describe('roles del POS — CAPITAN y MESERO', () => {
  let users: UsersService;
  let usersRepo: { create: jest.Mock; save: jest.Mock; count: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    usersRepo = { create: jest.fn((d) => d), save: jest.fn((d) => Promise.resolve({ id: 'u1', ...d })), count: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn().mockResolvedValue({ plan: 'PRO' }) } },
      ],
    }).compile();
    users = module.get(UsersService);
  });

  it('las constantes: sucursal obligatoria y NIP', () => {
    expect(ROLES_CON_SUCURSAL.sort()).toEqual(['CAJERO', 'CAPITAN', 'GERENTE', 'MESERO']);
    expect(ROLES_NIP.sort()).toEqual(['CAJERO', 'CAPITAN', 'MESERO']);
    expect(ROLES_CAJA.sort()).toEqual(['ADMIN', 'CAJERO', 'GERENTE']);
  });

  it.each(['CAJERO', 'GERENTE', 'MESERO', 'CAPITAN'])('%s sin empresa/sucursal: 400 y no guarda', async (rol) => {
    await expect(users.create('a@b.c', '1234', 'X', undefined, rol, 'tenant-A', undefined, undefined)).rejects.toThrow(BadRequestException);
    await expect(users.create('a@b.c', '1234', 'X', undefined, rol, 'tenant-A', 'co-1', undefined)).rejects.toThrow(`Los usuarios ${rol} requieren empresa y sucursal asignadas.`);
    expect(usersRepo.save).not.toHaveBeenCalled();
  });

  it.each(['CAJERO', 'GERENTE', 'MESERO', 'CAPITAN'])('%s con empresa y sucursal: se crea', async (rol) => {
    await expect(users.create('a@b.c', '1234', 'X', undefined, rol, 'tenant-A', 'co-1', 'suc-1')).resolves.toBeDefined();
    expect(usersRepo.save).toHaveBeenCalledWith(expect.objectContaining({ roleCode: rol, branchId: 'suc-1' }));
  });

  it('ADMIN y CONTADOR no exigen sucursal', async () => {
    await expect(users.create('a@b.c', 'Admin123', 'X', undefined, 'ADMIN', 'tenant-A')).resolves.toBeDefined();
    await expect(users.create('c@b.c', 'Admin123', 'X', undefined, 'CONTADOR', 'tenant-A')).resolves.toBeDefined();
  });

  it('initializeDefaultRoles() crea CAPITAN y MESERO (globales: code único, sin tenant)', async () => {
    const creados: string[] = [];
    const rolesRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((d) => d), save: jest.fn((d) => { creados.push(d.code); return Promise.resolve({ id: d.code, ...d }); }), find: jest.fn().mockResolvedValue([]) };
    const permsRepo = { create: jest.fn((d) => d), save: jest.fn().mockResolvedValue([]) };
    const m: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: getRepositoryToken(Role), useValue: { ...rolesRepo, findOne: jest.fn().mockResolvedValue(null) } }, { provide: getRepositoryToken(Permission), useValue: permsRepo }],
    }).compile();
    const svc = m.get(RolesService);
    jest.spyOn(svc, 'create').mockImplementation(async (code: string) => { creados.push(code); return {} as any; });
    jest.spyOn(svc, 'findAll').mockResolvedValue([]);
    await svc.initializeDefaultRoles();
    expect(creados).toEqual(expect.arrayContaining(['CAPITAN', 'MESERO', 'CAJERO', 'ADMIN']));
  });
});
