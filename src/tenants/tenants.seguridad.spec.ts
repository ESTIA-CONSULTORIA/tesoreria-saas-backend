import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantsController } from './tenants.controller';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';

// C1/C2 (ESTADO-SISTEMA): plan/onboard/listado de tenants. Roles vía RolesGuard real + metadata del controller;
// aislamiento vía el controller con un servicio doble.
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';

const usuario = (roleCode: string, tenantId: string | null) => ({ id: 'u1', roleCode, tenantId });

function contexto(controller: any, metodo: string, user: any) {
  return {
    getHandler: () => controller.prototype[metodo],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('TenantsController — C1: cambios de plan/estado solo SOPORTE', () => {
  const guard = new RolesGuard(new Reflector());

  it('PUT :id/plan exige SOPORTE', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantsController.prototype.updatePlan)).toEqual(['SOPORTE']);
  });

  it('un CAJERO recibe 403 en PUT :id/plan', () => {
    expect(() => guard.canActivate(contexto(TenantsController, 'updatePlan', usuario('CAJERO', TENANT_A)))).toThrow(ForbiddenException);
  });

  it('un ADMIN de otro tenant recibe 403 en PUT :id/plan', () => {
    expect(() => guard.canActivate(contexto(TenantsController, 'updatePlan', usuario('ADMIN', TENANT_B)))).toThrow(ForbiddenException);
  });

  it('incluso el ADMIN del propio tenant recibe 403 en PUT :id/plan (el plan es dinero)', () => {
    expect(() => guard.canActivate(contexto(TenantsController, 'updatePlan', usuario('ADMIN', TENANT_A)))).toThrow(ForbiddenException);
  });

  it('SOPORTE sí cambia el plan', () => {
    expect(guard.canActivate(contexto(TenantsController, 'updatePlan', usuario('SOPORTE', null)))).toBe(true);
  });

  it('PUT :id y POST siguen siendo solo SOPORTE', () => {
    expect(Reflect.getMetadata(ROLES_KEY, TenantsController.prototype.update)).toEqual(['SOPORTE']);
    expect(Reflect.getMetadata(ROLES_KEY, TenantsController.prototype.create)).toEqual(['SOPORTE']);
  });

  it('PATCH :id/onboard: un CAJERO recibe 403', () => {
    expect(() => guard.canActivate(contexto(TenantsController, 'markOnboarded', usuario('CAJERO', TENANT_A)))).toThrow(ForbiddenException);
  });
});

describe('TenantsController — C2: aislamiento de lecturas y onboard', () => {
  const tenants = [
    { id: TENANT_A, legalName: 'A', rfc: 'AAA010101AAA', plan: 'PROFESIONAL' },
    { id: TENANT_B, legalName: 'B', rfc: 'BBB010101BBB', plan: 'BASIC' },
  ];
  let servicio: any;
  let controller: TenantsController;

  beforeEach(() => {
    servicio = {
      findAll: jest.fn().mockResolvedValue(tenants),
      findOne: jest.fn((id: string) => Promise.resolve(tenants.find((t) => t.id === id) ?? null)),
      markOnboarded: jest.fn().mockResolvedValue({ ok: true }),
    };
    controller = new TenantsController(servicio);
  });

  it('GET /tenants: un CAJERO ve solo el tenant de su token', async () => {
    const r = await controller.findAll({ user: usuario('CAJERO', TENANT_A) });
    expect(r).toEqual([tenants[0]]);
    expect(servicio.findAll).not.toHaveBeenCalled();
  });

  it('GET /tenants: un ADMIN ve solo el suyo', async () => {
    const r = await controller.findAll({ user: usuario('ADMIN', TENANT_B) });
    expect(r.map((t: any) => t.id)).toEqual([TENANT_B]);
  });

  it('GET /tenants: sin tenantId en el token no se lista nada', async () => {
    expect(await controller.findAll({ user: usuario('ADMIN', null) })).toEqual([]);
    expect(await controller.findAll({})).toEqual([]);
  });

  it('GET /tenants: SOPORTE ve todos', async () => {
    const r = await controller.findAll({ user: usuario('SOPORTE', null) });
    expect(r).toHaveLength(2);
  });

  it('GET /tenants/:id: el propio sí; otro tenant es 403', async () => {
    expect((await controller.findOne(TENANT_A, { user: usuario('GERENTE', TENANT_A) }))?.id).toBe(TENANT_A);
    expect(() => controller.findOne(TENANT_B, { user: usuario('GERENTE', TENANT_A) })).toThrow(ForbiddenException);
    expect(servicio.findOne).toHaveBeenCalledTimes(1);
  });

  it('GET /tenants/:id: SOPORTE lee cualquiera', async () => {
    expect((await controller.findOne(TENANT_B, { user: usuario('SOPORTE', null) }))?.id).toBe(TENANT_B);
  });

  it('GET /tenants/:id: sin sesión es 403', () => {
    expect(() => controller.findOne(TENANT_A, {})).toThrow(ForbiddenException);
  });

  it('PATCH :id/onboard: un ADMIN de otro tenant es 403 y no escribe', () => {
    expect(() => controller.markOnboarded(TENANT_A, { user: usuario('ADMIN', TENANT_B) })).toThrow(ForbiddenException);
    expect(servicio.markOnboarded).not.toHaveBeenCalled();
  });

  it('PATCH :id/onboard: el ADMIN del propio tenant sí', async () => {
    await controller.markOnboarded(TENANT_A, { user: usuario('ADMIN', TENANT_A) });
    expect(servicio.markOnboarded).toHaveBeenCalledWith(TENANT_A);
  });
});
