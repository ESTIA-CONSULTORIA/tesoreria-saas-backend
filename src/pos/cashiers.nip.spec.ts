import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CashiersService } from './cashiers.service';
import { CashiersController } from './cashiers.controller';
import { NipThrottleService, NIP_LIMITS, NIP_WINDOW_MS } from './nip-throttle.service';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { UsersService } from '../users/users.service';

// POS Lite con NIP para MESERO y CAPITAN (además de CAJERO) y límite de intentos que ya no bloquea a todas las
// tabletas de un local detrás de la misma IP.
const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const hash = (nip: string) => bcrypt.hashSync(nip, 4);

const USERS = [
  { id: 'u-cajero', email: 'caj@a', name: 'Caja', roleCode: 'CAJERO', tenantId: TENANT_A, companyId: 'co-A', branchId: 'suc-A', isActive: true, password: hash('1111') },
  { id: 'u-mesero', email: 'mes@a', name: 'Mesero', roleCode: 'MESERO', tenantId: TENANT_A, companyId: 'co-A', branchId: 'suc-A', isActive: true, password: hash('2222') },
  { id: 'u-capitan', email: 'cap@a', name: 'Capitan', roleCode: 'CAPITAN', tenantId: TENANT_A, companyId: 'co-A', branchId: 'suc-A', isActive: true, password: hash('3333') },
  { id: 'u-gerente', email: 'ger@a', name: 'Gerente', roleCode: 'GERENTE', tenantId: TENANT_A, companyId: 'co-A', branchId: 'suc-A', isActive: true, password: hash('4444') },
  { id: 'u-admin', email: 'adm@a', name: 'Admin', roleCode: 'ADMIN', tenantId: TENANT_A, companyId: 'co-A', branchId: null, isActive: true, password: hash('5555') },
  { id: 'u-baja', email: 'baja@a', name: 'Baja', roleCode: 'MESERO', tenantId: TENANT_A, companyId: 'co-A', branchId: 'suc-A', isActive: false, password: hash('6666') },
  { id: 'u-mesero-B', email: 'mes@b', name: 'MeseroB', roleCode: 'MESERO', tenantId: TENANT_B, companyId: 'co-B', branchId: 'suc-B', isActive: true, password: hash('7777') },
];

describe('POS Lite NIP — roles y token', () => {
  let service: CashiersService;
  let signed: any[];

  beforeEach(async () => {
    signed = [];
    // Respeta el where del servicio: In(ROLES_NIP) llega como FindOperator con _value.
    const usersRepo = {
      find: jest.fn(({ where }: any) =>
        Promise.resolve(
          USERS.filter(
            (u) =>
              u.isActive === where.isActive &&
              where.roleCode._value.includes(u.roleCode) &&
              (!where.tenantId || u.tenantId === where.tenantId) &&
              (!where.id || u.id === where.id),
          ),
        ),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashiersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn().mockResolvedValue({ plan: 'PRO' }) } },
        { provide: JwtService, useValue: { sign: jest.fn((p) => { signed.push(p); return 'token'; }) } },
      ],
    }).compile();
    service = module.get(CashiersService);
  });

  it.each([
    ['1111', 'CAJERO'],
    ['2222', 'MESERO'],
    ['3333', 'CAPITAN'],
  ])('el NIP %s inicia sesión como %s', async (nip, rol) => {
    const r = await service.loginWithNip(nip, TENANT_A);
    expect(r.user.roleCode).toBe(rol);
    expect(r.access_token).toBe('token');
  });

  it('GERENTE y ADMIN no entran por NIP (usan sesión ERP)', async () => {
    await expect(service.loginWithNip('4444', TENANT_A)).rejects.toThrow('NIP incorrecto');
    await expect(service.loginWithNip('5555', TENANT_A)).rejects.toThrow('NIP incorrecto');
  });

  it('un usuario dado de baja no entra; el NIP de otro tenant no sirve', async () => {
    await expect(service.loginWithNip('6666', TENANT_A)).rejects.toThrow('NIP incorrecto');
    await expect(service.loginWithNip('7777', TENANT_A)).rejects.toThrow('NIP incorrecto');
    await expect(service.loginWithNip('7777', TENANT_B)).resolves.toBeDefined();
  });

  it('el token POS Lite lleva rol, tenant, empresa y SUCURSAL del usuario, y posLiteAccess', async () => {
    await service.loginWithNip('2222', TENANT_A);
    expect(signed[0]).toEqual(expect.objectContaining({ sub: 'u-mesero', roleCode: 'MESERO', tenantId: TENANT_A, companyId: 'co-A', branchId: 'suc-A', posLiteAccess: true }));
  });

  it('con userId: el NIP se verifica SOLO contra ese usuario', async () => {
    await expect(service.loginWithNip('2222', TENANT_A, 'u-mesero')).resolves.toBeDefined();
    await expect(service.loginWithNip('2222', TENANT_A, 'u-capitan')).rejects.toThrow('NIP incorrecto');
  });
});

describe('NipThrottleService — límite de intentos', () => {
  let t: NipThrottleService;
  let ahora: number;
  beforeEach(() => {
    t = new NipThrottleService();
    ahora = 1_000_000;
    t.now = () => ahora;
  });
  const fallar = (n: number, tenant = TENANT_A, user?: string, ip = '10.0.0.1') => { for (let i = 0; i < n; i++) t.registerFailure(tenant, user, ip); };

  it('varias tabletas detrás de la misma IP no se bloquean por 5 fallos (antes: 5 por IP / 15 min)', () => {
    fallar(5);
    expect(() => t.assertAllowed(TENANT_A, undefined, '10.0.0.1')).not.toThrow();
    fallar(NIP_LIMITS.tenantIp - 5);
    expect(() => t.assertAllowed(TENANT_A, undefined, '10.0.0.1')).toThrow(HttpException);
  });

  it('el bloqueo por IP de un tenant no afecta a otra IP ni a otro tenant', () => {
    fallar(NIP_LIMITS.tenantIp);
    expect(() => t.assertAllowed(TENANT_A, undefined, '10.0.0.2')).not.toThrow();
    expect(() => t.assertAllowed(TENANT_B, undefined, '10.0.0.1')).not.toThrow();
  });

  it('tope por tenant entre TODAS las IPs (fuerza bruta distribuida): 429', () => {
    for (let i = 0; i < NIP_LIMITS.tenant; i++) t.registerFailure(TENANT_A, undefined, `ip-${i}`);
    const err: any = (() => { try { t.assertAllowed(TENANT_A, undefined, 'ip-nueva'); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(() => t.assertAllowed(TENANT_B, undefined, 'ip-nueva')).not.toThrow();
  });

  it('con usuario indicado: 5 fallos de ese usuario desde esa IP lo bloquean; otro usuario en la misma IP sigue pudiendo', () => {
    fallar(NIP_LIMITS.userIp, TENANT_A, 'u-mesero');
    expect(() => t.assertAllowed(TENANT_A, 'u-mesero', '10.0.0.1')).toThrow(HttpException);
    expect(() => t.assertAllowed(TENANT_A, 'u-capitan', '10.0.0.1')).not.toThrow();
  });

  it('un login correcto limpia los contadores de IP del usuario, no el tope por tenant', () => {
    fallar(NIP_LIMITS.userIp - 1, TENANT_A, 'u-mesero');
    t.registerSuccess(TENANT_A, 'u-mesero', '10.0.0.1');
    fallar(NIP_LIMITS.userIp - 1, TENANT_A, 'u-mesero');
    expect(() => t.assertAllowed(TENANT_A, 'u-mesero', '10.0.0.1')).not.toThrow();
  });

  it('la ventana vence a los 15 minutos', () => {
    fallar(NIP_LIMITS.tenantIp);
    expect(() => t.assertAllowed(TENANT_A, undefined, '10.0.0.1')).toThrow();
    ahora += NIP_WINDOW_MS + 1;
    expect(() => t.assertAllowed(TENANT_A, undefined, '10.0.0.1')).not.toThrow();
  });
});

describe('CashiersController.loginWithNip — límite y respuesta', () => {
  let controller: CashiersController;
  let cashiers: { loginWithNip: jest.Mock };
  let throttle: NipThrottleService;
  const res: any = { cookie: jest.fn() };
  const req = (ip = '10.0.0.1', extra: any = {}) => ({ headers: { 'x-forwarded-for': ip }, ip: '10.9.9.9', ...extra });

  beforeEach(async () => {
    cashiers = { loginWithNip: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CashiersController],
      providers: [
        { provide: CashiersService, useValue: cashiers },
        { provide: JwtService, useValue: {} },
        NipThrottleService,
      ],
    }).compile();
    controller = module.get(CashiersController);
    throttle = module.get(NipThrottleService);
  });

  it('NIP incorrecto: 401 y cuenta el fallo; al llegar al tope por tenant+IP responde 429 sin consultar usuarios', async () => {
    cashiers.loginWithNip.mockRejectedValue(new HttpException('NIP incorrecto', HttpStatus.UNAUTHORIZED));
    for (let i = 0; i < NIP_LIMITS.tenantIp; i++) {
      await expect(controller.loginWithNip({ nip: '0000', tenantId: TENANT_A }, req(), res)).rejects.toMatchObject({ status: 401 });
    }
    cashiers.loginWithNip.mockClear();
    await expect(controller.loginWithNip({ nip: '2222', tenantId: TENANT_A }, req(), res)).rejects.toMatchObject({ status: 429 });
    expect(cashiers.loginWithNip).not.toHaveBeenCalled();
    // otra tableta (otra IP) del mismo local sigue entrando
    cashiers.loginWithNip.mockResolvedValue({ access_token: 't', user: { id: 'u' }, modulosActivos: ['pos'] });
    await expect(controller.loginWithNip({ nip: '2222', tenantId: TENANT_A }, req('10.0.0.2'), res)).resolves.toEqual(expect.objectContaining({ user: { id: 'u' } }));
  });

  it('un error que no es 401 (p. ej. caída de BD) no cuenta como intento fallido', async () => {
    cashiers.loginWithNip.mockRejectedValue(new Error('db down'));
    for (let i = 0; i < NIP_LIMITS.tenantIp + 2; i++) {
      await expect(controller.loginWithNip({ nip: '2222', tenantId: TENANT_A }, req(), res)).rejects.toThrow('db down');
    }
  });

  it('el tenant sale del JWT si hay sesión (no del body) y el userId opcional se pasa al servicio', async () => {
    cashiers.loginWithNip.mockResolvedValue({ access_token: 't', user: {}, modulosActivos: [] });
    await controller.loginWithNip({ nip: '2222', tenantId: TENANT_B, userId: 'u-mesero' }, req('1.1.1.1', { user: { tenantId: TENANT_A } }), res);
    expect(cashiers.loginWithNip).toHaveBeenCalledWith('2222', TENANT_A, 'u-mesero');
  });

  it('usa el primer valor de x-forwarded-for como IP (detrás del proxy req.ip es siempre el proxy)', async () => {
    const spy = jest.spyOn(throttle, 'assertAllowed');
    cashiers.loginWithNip.mockResolvedValue({ access_token: 't', user: {}, modulosActivos: [] });
    await controller.loginWithNip({ nip: '2222', tenantId: TENANT_A }, req('203.0.113.7, 10.1.1.1'), res);
    expect(spy).toHaveBeenCalledWith(TENANT_A, undefined, '203.0.113.7');
  });
});

describe('UsersService — el NIP de 4 dígitos no se repite en el tenant', () => {
  let users: UsersService;
  let usersRepo: { find: jest.Mock; create: jest.Mock; save: jest.Mock; count: jest.Mock; findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    usersRepo = {
      find: jest.fn(() => Promise.resolve(USERS.filter((u) => u.tenantId === TENANT_A && u.isActive).map((u) => ({ id: u.id, password: u.password })))),
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ id: 'nuevo', ...d })),
      count: jest.fn(),
      findOne: jest.fn(({ where }: any) => Promise.resolve(USERS.find((u) => u.id === where.id) ?? null)),
      update: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Tenant), useValue: { findOne: jest.fn().mockResolvedValue({ plan: 'PRO' }) } },
      ],
    }).compile();
    users = module.get(UsersService);
  });

  it.each(['MESERO', 'CAPITAN', 'CAJERO'])('crear un %s con un NIP ya usado: 400 y no guarda', async (rol) => {
    await expect(users.create('n@a', '2222', 'N', undefined, rol, TENANT_A, 'co-A', 'suc-A')).rejects.toThrow('Ese NIP ya lo usa otro usuario');
    expect(usersRepo.save).not.toHaveBeenCalled();
  });

  it('un NIP libre se crea; el mismo NIP en OTRO tenant no choca', async () => {
    await expect(users.create('n@a', '9999', 'N', undefined, 'MESERO', TENANT_A, 'co-A', 'suc-A')).resolves.toBeDefined();
    usersRepo.find.mockResolvedValue([]); // el tenant B no tiene a nadie con ese NIP
    await expect(users.create('n@b', '2222', 'N', undefined, 'MESERO', TENANT_B, 'co-B', 'suc-B')).resolves.toBeDefined();
  });

  it('editar el NIP de un usuario a uno ya usado por OTRO: 400; conservar el suyo: ok', async () => {
    await expect(users.update('u-mesero', { password: '1111' }, { tenantId: TENANT_A })).rejects.toThrow('Ese NIP ya lo usa otro usuario');
    await expect(users.update('u-mesero', { password: '2222' }, { tenantId: TENANT_A })).resolves.toBeDefined();
  });

  it('un ADMIN o CONTADOR con contraseña de 4 dígitos no entra en la regla de NIP', async () => {
    await expect(users.create('a@a', '1111', 'A', undefined, 'ADMIN', TENANT_A)).resolves.toBeDefined();
  });
});
