import { of, lastValueFrom } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { MASCARA } from './redactar';

function contexto(req: any, status = 201) {
  return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: status }) }) } as any;
}

describe('AuditInterceptor: no guarda secretos', () => {
  it('el login y el alta de usuarios se registran con contraseña y NIP enmascarados', async () => {
    const createLog = jest.fn().mockResolvedValue(undefined);
    const interceptor = new AuditInterceptor({ createLog } as any);
    const req = {
      method: 'POST',
      url: '/api/v1/users?token=abc',
      user: { id: 'u1', email: 'admin@x', roleCode: 'ADMIN', tenantId: 'T1' },
      body: { email: 'nuevo@x', password: 'Secreta123', nip: '4321', name: 'Ana', roleCode: 'CAJERO' },
      headers: {},
      ip: '1.2.3.4',
    };
    await lastValueFrom(interceptor.intercept(contexto(req), { handle: () => of({ ok: true }) } as any));
    await new Promise((r) => setImmediate(r)); // el registro se escribe en un tap asíncrono

    expect(createLog).toHaveBeenCalledTimes(1);
    const { details } = createLog.mock.calls[0][0];
    expect(details.body).toEqual({ email: 'nuevo@x', password: MASCARA, nip: MASCARA, name: 'Ana', roleCode: 'CAJERO' });
    expect(details.url).toBe(`/api/v1/users?token=${MASCARA}`);
    expect(JSON.stringify(createLog.mock.calls[0][0])).not.toMatch(/Secreta123|4321|abc/);
  });

  it('un GET no se registra', async () => {
    const createLog = jest.fn();
    const interceptor = new AuditInterceptor({ createLog } as any);
    await lastValueFrom(interceptor.intercept(contexto({ method: 'GET', url: '/x', headers: {} }), { handle: () => of(1) } as any));
    expect(createLog).not.toHaveBeenCalled();
  });
});
