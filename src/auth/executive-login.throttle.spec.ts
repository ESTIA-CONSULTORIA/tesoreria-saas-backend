import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { NipThrottleService, NIP_LIMITS } from '../pos/nip-throttle.service';

function montar() {
  const authService: any = { executiveLogin: jest.fn() };
  const throttle = new NipThrottleService();
  const ctrl = new AuthController(authService, {} as any, throttle);
  const res: any = { cookie: jest.fn(), setHeader: jest.fn() };
  const req = (ip: string) => ({ headers: { 'x-forwarded-for': ip }, ip: '10.9.9.9' });
  return { authService, throttle, ctrl, res, req };
}
const mal = () => { throw new UnauthorizedException('PIN incorrecto'); };

describe('executive-login: límite de intentos por tenant', () => {
  it('bloquea el tenant tras sus fallos aunque cambie la IP', async () => {
    const { authService, ctrl, res, req } = montar();
    authService.executiveLogin.mockImplementation(mal);
    for (let i = 0; i < NIP_LIMITS.tenant; i++) {
      await expect(ctrl.executiveLogin({ tenantId: 'T1', pin: '000000' }, req(`1.1.${Math.floor(i / 250)}.${i % 250}`), res)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    const llamadas = authService.executiveLogin.mock.calls.length;
    await expect(ctrl.executiveLogin({ tenantId: 'T1', pin: '482913' }, req('9.9.9.9'), res)).rejects.toThrow(HttpException);
    expect(authService.executiveLogin.mock.calls.length).toBe(llamadas); // ni siquiera se compara el PIN
  });

  it('bloquea una IP tras NIP_LIMITS.tenantIp fallos, sin afectar a otra IP', async () => {
    const { authService, ctrl, res, req } = montar();
    authService.executiveLogin.mockImplementation(mal);
    for (let i = 0; i < NIP_LIMITS.tenantIp; i++) await ctrl.executiveLogin({ tenantId: 'T1', pin: '1' }, req('2.2.2.2'), res).catch(() => undefined);
    await expect(ctrl.executiveLogin({ tenantId: 'T1', pin: '1' }, req('2.2.2.2'), res)).rejects.toMatchObject({ status: 429 });
    authService.executiveLogin.mockResolvedValueOnce({ access_token: 't', user: { id: 'u' } });
    await expect(ctrl.executiveLogin({ tenantId: 'T1', pin: '482913' }, req('3.3.3.3'), res)).resolves.toEqual({ user: { id: 'u' } });
  });

  it('otro tenant no se ve afectado y un acierto limpia el contador de la IP', async () => {
    const { authService, ctrl, res, req } = montar();
    authService.executiveLogin.mockImplementation(mal);
    for (let i = 0; i < NIP_LIMITS.tenantIp - 1; i++) await ctrl.executiveLogin({ tenantId: 'T1', pin: '1' }, req('4.4.4.4'), res).catch(() => undefined);
    authService.executiveLogin.mockResolvedValueOnce({ access_token: 't', user: { id: 'u' } });
    await ctrl.executiveLogin({ tenantId: 'T1', pin: '482913' }, req('4.4.4.4'), res);
    authService.executiveLogin.mockImplementation(mal);
    await expect(ctrl.executiveLogin({ tenantId: 'T1', pin: '1' }, req('4.4.4.4'), res)).rejects.toBeInstanceOf(UnauthorizedException); // ya no está bloqueada
    await expect(ctrl.executiveLogin({ tenantId: 'T2', pin: '1' }, req('4.4.4.4'), res)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('no usa las mismas llaves que el NIP del POS', async () => {
    const { authService, throttle, ctrl, res, req } = montar();
    authService.executiveLogin.mockImplementation(mal);
    for (let i = 0; i < NIP_LIMITS.tenantIp; i++) await ctrl.executiveLogin({ tenantId: 'T1', pin: '1' }, req('5.5.5.5'), res).catch(() => undefined);
    expect(() => throttle.assertAllowed('T1', undefined, '5.5.5.5')).not.toThrow();
  });
});
