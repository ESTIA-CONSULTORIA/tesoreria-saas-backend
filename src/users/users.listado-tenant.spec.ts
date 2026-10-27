import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

// GET /users (pantalla Usuarios): el ?tenantId= solo lo respeta SOPORTE; cualquier otro rol ve únicamente el tenant de su token.
const A = 'tenant-A';
const B = 'tenant-B';

describe('UsersController.findAll — ?tenantId= solo para SOPORTE', () => {
  let controller: UsersController;
  let service: { listarConNombres: jest.Mock };

  beforeEach(async () => {
    service = { listarConNombres: jest.fn().mockResolvedValue([]) };
    const m: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();
    controller = m.get(UsersController);
  });

  it.each(['ADMIN', 'GERENTE', 'CAJERO', 'RECEPCION'])('%s con ?tenantId=otro: se ignora y manda el token', async (roleCode) => {
    await controller.findAll(B, { user: { roleCode, tenantId: A } } as any);
    expect(service.listarConNombres).toHaveBeenCalledTimes(1);
    expect(service.listarConNombres).toHaveBeenCalledWith(A);
  });

  it('ADMIN sin ?tenantId= ve su tenant', async () => {
    await controller.findAll(undefined, { user: { roleCode: 'ADMIN', tenantId: A } } as any);
    expect(service.listarConNombres).toHaveBeenCalledWith(A);
  });

  it('un rol que no es SOPORTE y no trae tenant en el token no ve a nadie, ni con ?tenantId= (antes listaba todos los tenants)', async () => {
    for (const q of [undefined, B]) {
      expect(controller.findAll(q, { user: { roleCode: 'ADMIN', tenantId: undefined } } as any)).toEqual([]);
    }
    expect(controller.findAll(B, {} as any)).toEqual([]);
    expect(service.listarConNombres).not.toHaveBeenCalled();
  });

  it('SOPORTE con ?tenantId= ve ese negocio', async () => {
    await controller.findAll(B, { user: { roleCode: 'SOPORTE' } } as any);
    expect(service.listarConNombres).toHaveBeenCalledWith(B);
  });

  it('SOPORTE sin ?tenantId= (o vacío) ve todos los negocios', async () => {
    await controller.findAll(undefined, { user: { roleCode: 'SOPORTE' } } as any);
    await controller.findAll('', { user: { roleCode: 'SOPORTE' } } as any);
    expect(service.listarConNombres).toHaveBeenNthCalledWith(1, undefined);
    expect(service.listarConNombres).toHaveBeenNthCalledWith(2, undefined);
  });
});

describe('UsersService.listarConNombres', () => {
  let service: UsersService;
  let qb: any;

  beforeEach(async () => {
    qb = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: [{ id: 'u1', email: 'a@x.mx' }, { id: 'u2', email: 'b@x.mx' }],
        raw: [
          { tenantNombre: 'Gimnasio Demo', empresaNombre: 'Gimnasio Demo', sucursalNombre: 'Matriz' },
          { tenantNombre: null, empresaNombre: null, sucursalNombre: null },
        ],
      }),
    };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: { createQueryBuilder: jest.fn(() => qb) } },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn() } },
      ],
    }).compile();
    service = m.get(UsersService);
  });

  it('con tenant acota la consulta a ese tenant; sin tenant no agrega where', async () => {
    await service.listarConNombres(A);
    expect(qb.where).toHaveBeenCalledWith('user.tenantId = :tenantId', { tenantId: A });
    qb.where.mockClear();
    await service.listarConNombres(undefined);
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('devuelve los nombres de negocio, empresa y sucursal (null si no tiene) y nunca la contraseña', async () => {
    const r = await service.listarConNombres(A);
    expect(r[0]).toMatchObject({ id: 'u1', tenantNombre: 'Gimnasio Demo', empresaNombre: 'Gimnasio Demo', sucursalNombre: 'Matriz' });
    expect(r[1]).toMatchObject({ id: 'u2', tenantNombre: null, empresaNombre: null, sucursalNombre: null });
    expect(JSON.stringify(r)).not.toMatch(/password/i);
    const campos = qb.select.mock.calls[0][0] as string[];
    expect(campos).not.toContain('user.password');
  });
});
