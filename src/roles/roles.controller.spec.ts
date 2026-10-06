import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesController } from './roles.controller';
import { RolesGuard } from '../auth/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';

// POST /roles no tenía guard: cualquier usuario autenticado podía crear roles (globales, no por tenant).
describe('RolesController — POST /roles', () => {
  const guard = new RolesGuard(new Reflector());
  const ctx = (roleCode?: string): ExecutionContext =>
    ({
      getHandler: () => RolesController.prototype.create,
      getClass: () => RolesController,
      switchToHttp: () => ({ getRequest: () => ({ user: roleCode ? { roleCode } : undefined }) }),
    }) as unknown as ExecutionContext;

  it('declara @Roles(ADMIN, SOPORTE)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, RolesController.prototype.create)).toEqual(['ADMIN', 'SOPORTE']);
  });

  it.each(['CAJERO', 'GERENTE', 'CONTADOR', 'MESERO', 'CAPITAN', 'USER'])('%s: 403', (rol) => {
    expect(() => guard.canActivate(ctx(rol))).toThrow(ForbiddenException);
  });

  it('sin usuario (sin sesión): 403', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });

  it.each(['ADMIN', 'SOPORTE'])('%s: pasa', (rol) => {
    expect(guard.canActivate(ctx(rol))).toBe(true);
  });
});
