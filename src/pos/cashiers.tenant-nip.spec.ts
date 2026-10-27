import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CashiersService } from './cashiers.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// El NIP del POS nunca se busca sin negocio, el selector de cajeros solo lista a los del propio tenant, y no se crea un usuario de sucursal sin tenant.
const A = 'tenant-A';
const B = 'tenant-B';
const hash = (nip: string) => bcrypt.hashSync(nip, 4);
const USERS: any[] = [
  { id: 'a-caj', name: 'Cajera A', email: 'caj@a.mx', roleCode: 'CAJERO', tenantId: A, branchId: 'suc-1', isActive: true, password: hash('1111') },
  { id: 'a-mes', name: ' ', email: 'mes@a.mx', roleCode: 'MESERO', tenantId: A, branchId: null, isActive: true, password: hash('2222') },
  { id: 'a-otra', name: 'Cajero de otra sucursal', email: 'o@a.mx', roleCode: 'CAJERO', tenantId: A, branchId: 'suc-2', isActive: true, password: hash('3333') },
  { id: 'a-baja', name: 'De baja', email: 'b@a.mx', roleCode: 'CAJERO', tenantId: A, branchId: 'suc-1', isActive: false, password: hash('4444') },
  { id: 'a-ger', name: 'Gerente A', email: 'g@a.mx', roleCode: 'GERENTE', tenantId: A, branchId: 'suc-1', isActive: true, password: hash('5555') },
  { id: 'b-caj', name: 'Cajero B', email: 'caj@b.mx', roleCode: 'CAJERO', tenantId: B, branchId: 'suc-B', isActive: true, password: hash('9999') },
  { id: 'sin-tenant', name: 'Sin tenant', email: 'st@x.mx', roleCode: 'CAJERO', tenantId: null, branchId: 'suc-1', isActive: true, password: hash('8888') },
];

describe('CashiersService — NIP y selector de cajeros por tenant', () => {
  let service: CashiersService;
  let find: jest.Mock;

  beforeEach(async () => {
    find = jest.fn(({ where, select }: any) =>
      Promise.resolve(
        USERS.filter(
          (u) =>
            u.isActive === where.isActive &&
            where.roleCode._value.includes(u.roleCode) &&
            u.tenantId === where.tenantId &&
            (!where.id || u.id === where.id),
        ).map((u) => (select ? Object.fromEntries(select.map((k: string) => [k, u[k]])) : u)),
      ),
    );
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        CashiersService,
        { provide: getRepositoryToken(User), useValue: { find } },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn().mockResolvedValue({ plan: 'PRO' }) } },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'token') } },
      ],
    }).compile();
    service = m.get(CashiersService);
  });

  describe('loginWithNip', () => {
    it('sin tenant: 400 y ni siquiera consulta usuarios (antes buscaba el NIP en todos los tenants)', async () => {
      for (const tenant of [undefined, '', null as any]) {
        await expect(service.loginWithNip('9999', tenant)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.loginWithNip('8888', tenant)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(find).not.toHaveBeenCalled();
    });

    it('con tenant solo entra un usuario de ESE tenant: el NIP de otro tenant o de un usuario sin tenant no sirve', async () => {
      await expect(service.loginWithNip('1111', A)).resolves.toMatchObject({ user: { id: 'a-caj' } });
      await expect(service.loginWithNip('9999', A)).rejects.toMatchObject({ status: 401 });
      await expect(service.loginWithNip('8888', A)).rejects.toMatchObject({ status: 401 });
      await expect(service.loginWithNip('1111', B)).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('lista (selector del login del POS)', () => {
    it('solo cajeros, meseros y capitanes ACTIVOS del tenant: sin gerentes, sin dados de baja, sin otros tenants ni usuarios sin tenant', async () => {
      const r = await service.lista(A);
      expect(r.map((x) => x.id).sort()).toEqual(['a-caj', 'a-mes', 'a-otra']);
      expect((await service.lista(B)).map((x) => x.id)).toEqual(['b-caj']);
    });

    it('nunca mezcla tenants: lo de A no aparece en B y viceversa', async () => {
      const a = (await service.lista(A)).map((x) => x.id);
      const b = (await service.lista(B)).map((x) => x.id);
      expect(a.some((id) => b.includes(id))).toBe(false);
      expect(a).not.toContain('b-caj');
      expect(b).not.toContain('a-caj');
    });

    it('sin tenant devuelve vacío (nunca "todos")', async () => {
      expect(await service.lista(undefined)).toEqual([]);
      expect(await service.lista('')).toEqual([]);
      expect(find).not.toHaveBeenCalled();
    });

    it('con sucursal solo ve a los de la suya y a los que no tienen sucursal fija', async () => {
      expect((await service.lista(A, 'suc-1')).map((x) => x.id).sort()).toEqual(['a-caj', 'a-mes']);
      expect((await service.lista(A, 'suc-2')).map((x) => x.id).sort()).toEqual(['a-mes', 'a-otra']);
    });

    it('solo expone id, nombre y rol: nunca correo, NIP ni hash; pide al repositorio solo esas columnas', async () => {
      const r = await service.lista(A);
      expect(Object.keys(r[0]).sort()).toEqual(['id', 'nombre', 'rol']);
      expect(JSON.stringify(r)).not.toMatch(/@|\$2[aby]\$|password/);
      expect(find.mock.calls[0][0].select).toEqual(['id', 'name', 'roleCode', 'branchId']);
    });

    it('un nombre vacío sale como null (la pantalla pone un texto genérico)', async () => {
      expect((await service.lista(A)).find((x) => x.id === 'a-mes')!.nombre).toBeNull();
    });
  });
});

describe('UsersService.create — un usuario de sucursal siempre lleva tenant', () => {
  let users: UsersService;
  let repo: { create: jest.Mock; save: jest.Mock; find: jest.Mock; count: jest.Mock };

  beforeEach(async () => {
    repo = { create: jest.fn((d) => d), save: jest.fn((d) => Promise.resolve({ id: 'n', ...d })), find: jest.fn(() => Promise.resolve([])), count: jest.fn() };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn().mockResolvedValue({ plan: 'PRO' }) } },
      ],
    }).compile();
    users = m.get(UsersService);
  });

  it.each(['CAJERO', 'MESERO', 'CAPITAN', 'RECEPCION', 'GERENTE'])('%s sin tenant: 400 y no se guarda nada', async (rol) => {
    await expect(users.create('n@x.mx', '1234', 'N', undefined, rol, undefined, 'co-1', 'suc-1')).rejects.toThrow(/negocio/);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('con tenant se crea normal; un rol sin sucursal (ADMIN, SOPORTE) puede crearse sin tenant', async () => {
    await expect(users.create('n@x.mx', '1234', 'N', undefined, 'CAJERO', A, 'co-1', 'suc-1')).resolves.toBeDefined();
    await expect(users.create('s@x.mx', 'clave-larga-segura', 'S', undefined, 'SOPORTE', undefined)).resolves.toBeDefined();
  });
});
