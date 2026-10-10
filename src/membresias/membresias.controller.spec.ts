import { ForbiddenException } from '@nestjs/common';
import { MembresiasController } from './membresias.controller';
import { ROLES_KEY } from '../auth/roles.decorator';
import { MODULO_KEY } from '../auth/modulo.decorator';

// Permisos de los endpoints de membresías (la regla vive en @Roles / @Modulo) y tenant siempre del token.
describe('MembresiasController — permisos y tenant', () => {
  const roles = (fn: any) => Reflect.getMetadata(ROLES_KEY, fn) as string[];

  it('todo el controller es del módulo membresias (solo giro gimnasio)', () => {
    expect(Reflect.getMetadata(MODULO_KEY, MembresiasController)).toBe('membresias');
  });

  it('planes y reportes: solo ADMIN, GERENTE (y SOPORTE); RECEPCION no los edita ni ve ingresos', () => {
    const P = MembresiasController.prototype;
    for (const fn of [P.crearPlan, P.actualizarPlan, P.reporte, P.ingresos, P.cancelar]) {
      expect(roles(fn)).toEqual(['ADMIN', 'GERENTE', 'SOPORTE']);
      expect(roles(fn)).not.toContain('RECEPCION');
    }
  });

  it('socios, congelar, check-in y alertas: también RECEPCION; ni cajero ni mesero', () => {
    const P = MembresiasController.prototype;
    for (const fn of [P.planes, P.socios, P.crearSocio, P.socio, P.actualizarSocio, P.porNumero, P.congelar, P.descongelar, P.checkin, P.checkins, P.alertas]) {
      expect(roles(fn)).toEqual(['ADMIN', 'GERENTE', 'RECEPCION', 'SOPORTE']);
      expect(roles(fn)).not.toEqual(expect.arrayContaining(['CAJERO']));
      expect(roles(fn)).not.toEqual(expect.arrayContaining(['MESERO']));
    }
  });

  it('el tenant sale del token: sin tenant en la sesión → 403 (nunca se toma del body ni de la URL)', () => {
    const c = new MembresiasController({} as any);
    expect(() => c.planes({ user: { roleCode: 'ADMIN' } } as any)).toThrow(ForbiddenException);
    expect(() => c.socio('x', { user: {} } as any)).toThrow(ForbiddenException);
  });

  it('pasa al servicio el tenant del token, aunque el body traiga otro', async () => {
    const crearSocio = jest.fn().mockResolvedValue({});
    const c = new MembresiasController({ crearSocio } as any);
    await c.crearSocio({ nombre: 'Ana', tenantId: 'tenant-B' } as any, { user: { tenantId: 'tenant-A', branchId: 'suc-1' } } as any);
    expect(crearSocio).toHaveBeenCalledWith('tenant-A', expect.objectContaining({ nombre: 'Ana' }), 'suc-1');
  });
});
