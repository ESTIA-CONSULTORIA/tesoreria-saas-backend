import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from './roles.decorator';
import { SubscriptionsController } from '../subscriptions/subscriptions.controller';
import { PlansController } from '../plans/plans.controller';
import { BusinessTypesController } from '../business-types/business-types.controller';
import { RolesController } from '../roles/roles.controller';
import { CategoriesController } from '../categories/categories.controller';
import { assertTenantAccess, esSoporte, tenantDeSesion } from './tenant-access.util';
import { IS_PUBLIC_KEY } from './public.decorator';

// Barrido de seguridad (ESTADO-SISTEMA C1–C6): endpoints que cambian dinero/catálogo/roles globales son SOPORTE.
const SOLO_SOPORTE: Array<[string, any, string]> = [
  ['SubscriptionsController', SubscriptionsController, 'create'],
  ['SubscriptionsController', SubscriptionsController, 'updatePlan'],
  ['SubscriptionsController', SubscriptionsController, 'renew'],
  ['SubscriptionsController', SubscriptionsController, 'getAlerts'],
  ['PlansController', PlansController, 'create'],
  ['PlansController', PlansController, 'update'],
  ['BusinessTypesController', BusinessTypesController, 'create'],
  ['RolesController', RolesController, 'updatePermission'],
  ['CategoriesController', CategoriesController, 'create'],
];

const ctx = (controller: any, metodo: string, user: any) =>
  ({
    getHandler: () => controller.prototype[metodo],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('endpoints de plan/catálogo/roles globales: solo SOPORTE', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(SOLO_SOPORTE)('%s.%s declara @Roles(SOPORTE)', (_n, controller, metodo) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller.prototype[metodo])).toEqual(['SOPORTE']);
  });

  it.each(SOLO_SOPORTE)('%s.%s: CAJERO y ADMIN reciben 403; SOPORTE pasa', (_n, controller, metodo) => {
    expect(() => guard.canActivate(ctx(controller, metodo, { roleCode: 'CAJERO', tenantId: 't1' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(controller, metodo, { roleCode: 'ADMIN', tenantId: 't2' }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(controller, metodo, { roleCode: 'SOPORTE', tenantId: null }))).toBe(true);
  });

  it('POST /roles/initialize-default ya no es público (C6)', () => {
    const proto = RolesController.prototype.initializeDefaultRoles;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, proto)).toEqual(['ADMIN', 'SOPORTE']);
  });
});

describe('GET /subscriptions/tenant/:tenantId — aislamiento', () => {
  const ctrl = new SubscriptionsController({ findByTenant: jest.fn().mockResolvedValue({ ok: 1 }) } as any, {} as any);

  it('el propio tenant sí; otro es 403; SOPORTE cualquiera', async () => {
    await expect(ctrl.findByTenant('t1', { user: { roleCode: 'ADMIN', tenantId: 't1' } })).resolves.toEqual({ ok: 1 });
    expect(() => ctrl.findByTenant('t2', { user: { roleCode: 'ADMIN', tenantId: 't1' } })).toThrow(ForbiddenException);
    await expect(ctrl.findByTenant('t2', { user: { roleCode: 'SOPORTE' } })).resolves.toEqual({ ok: 1 });
  });
});

describe('tenant-access.util', () => {
  it('assertTenantAccess', () => {
    expect(() => assertTenantAccess({ roleCode: 'ADMIN', tenantId: 'a' }, 'a')).not.toThrow();
    expect(() => assertTenantAccess({ roleCode: 'ADMIN', tenantId: 'a' }, 'b')).toThrow(ForbiddenException);
    expect(() => assertTenantAccess({ roleCode: 'ADMIN', tenantId: null }, 'a')).toThrow(ForbiddenException);
    expect(() => assertTenantAccess(undefined, 'a')).toThrow(ForbiddenException);
    expect(() => assertTenantAccess({ roleCode: 'SOPORTE' }, 'z')).not.toThrow();
  });

  it('tenantDeSesion: token para todos, undefined para SOPORTE, 403 sin tenant', () => {
    expect(tenantDeSesion({ user: { roleCode: 'CAJERO', tenantId: 'a' } })).toBe('a');
    expect(tenantDeSesion({ user: { roleCode: 'SOPORTE', tenantId: 'a' } })).toBeUndefined();
    expect(() => tenantDeSesion({ user: { roleCode: 'ADMIN' } })).toThrow(ForbiddenException);
    expect(() => tenantDeSesion({})).toThrow(ForbiddenException);
    expect(esSoporte({ roleCode: 'SOPORTE' })).toBe(true);
  });
});
