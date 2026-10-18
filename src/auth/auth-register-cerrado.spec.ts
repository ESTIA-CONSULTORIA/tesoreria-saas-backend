import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// El alta pública de usuarios (POST /auth/register) creaba usuarios sin negocio ni rol y no tenía ningún consumidor.
// Los usuarios se crean por POST /users (con sesión y rol) o con el alta de tenant (SOPORTE). Este spec impide que reaparezca.
describe('POST /auth/register está cerrado', () => {
  const rutas = Object.getOwnPropertyNames(AuthController.prototype)
    .filter((n) => n !== 'constructor')
    .map((n) => ({ n, path: Reflect.getMetadata(PATH_METADATA, (AuthController.prototype as any)[n]), metodo: Reflect.getMetadata(METHOD_METADATA, (AuthController.prototype as any)[n]) }));

  it('el controlador no expone ninguna ruta «register»', () => {
    expect(rutas.filter((r) => String(r.path).includes('register') && r.metodo === RequestMethod.POST)).toEqual([]);
    expect(rutas.some((r) => r.n === 'register')).toBe(false);
  });

  it('el servicio ya no tiene register()', () => {
    expect((AuthService.prototype as any).register).toBeUndefined();
  });

  it('las rutas de login siguen ahí', () => {
    const paths = rutas.map((r) => r.path);
    for (const p of ['login', 'portal-login', 'service-login', 'executive-login']) expect(paths).toContain(p);
  });
});
