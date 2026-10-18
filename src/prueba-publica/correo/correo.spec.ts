import { CorreoError } from './correo-provider';
import { MockCorreoProvider } from './mock-correo.provider';
import { ResendCorreoProvider } from './resend-correo.provider';
import { crearCorreoProvider } from './correo-provider.factory';
import { enlaceActivacion, plantillaActivacion } from './plantilla-activacion';
import { variablesFaltantes } from '../prueba-publica.config';

const msg = { para: 'ana@gym.mx', asunto: 'Hola', html: '<p>hola</p>', texto: 'hola', claveIdempotencia: 'prueba-activacion:1' };
const ENV = { RESEND_API_KEY: 're_llave_secreta_123', CORREO_REMITENTE: 'ESTIA <prueba@mail.ejemplo.mx>' } as NodeJS.ProcessEnv;
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as any;

describe('MockCorreoProvider', () => {
  it('guarda en memoria, devuelve id y es idempotente por clave', async () => {
    const m = new MockCorreoProvider();
    const a = await m.enviar(msg);
    const b = await m.enviar(msg);
    expect(b).toEqual(a);
    expect(m.enviados).toHaveLength(1);
    await m.enviar({ ...msg, claveIdempotencia: 'otra' });
    expect(m.enviados).toHaveLength(2);
  });
  it('exige clave de idempotencia y puede fallar a pedido', async () => {
    await expect(new MockCorreoProvider().enviar({ ...msg, claveIdempotencia: '' })).rejects.toThrow();
    for (const codigo of ['RECHAZADO', 'NO_DISPONIBLE'] as const) {
      const e: any = await new MockCorreoProvider({ fallar: codigo }).enviar(msg).catch((x) => x);
      expect(e).toBeInstanceOf(CorreoError);
      expect(e.codigo).toBe(codigo);
    }
  });
});

describe('ResendCorreoProvider (con fetch simulado: no hay cuenta real)', () => {
  it('POST /emails con Bearer, Idempotency-Key y cuerpo {from,to[],subject,html,text}; devuelve el id', async () => {
    const http = jest.fn(async () => respuesta(200, { id: 'abc-123' }));
    const r = await new ResendCorreoProvider(ENV, http as any).enviar(msg);
    expect(r).toEqual({ id: 'abc-123' });
    const [url, init] = http.mock.calls[0] as any;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer re_llave_secreta_123', 'Idempotency-Key': 'prueba-activacion:1', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ from: 'ESTIA <prueba@mail.ejemplo.mx>', to: ['ana@gym.mx'], subject: 'Hola', html: '<p>hola</p>', text: 'hola' });
  });

  it('sin llave o remitente: NO_CONFIGURADO y no llama a la red', async () => {
    const http = jest.fn();
    for (const env of [{}, { RESEND_API_KEY: 'x' }, { CORREO_REMITENTE: 'x' }] as NodeJS.ProcessEnv[]) {
      const e: any = await new ResendCorreoProvider(env, http as any).enviar(msg).catch((x) => x);
      expect(e.codigo).toBe('NO_CONFIGURADO');
    }
    expect(http).not.toHaveBeenCalled();
  });

  it('4xx → RECHAZADO; 429, 5xx, respuesta rara y fallos de red → NO_DISPONIBLE', async () => {
    const caso = async (http: any) => ((await new ResendCorreoProvider(ENV, http).enviar(msg).catch((x) => x)) as any).codigo;
    expect(await caso(jest.fn(async () => respuesta(422, { message: 'invalid to ana@gym.mx' })))).toBe('RECHAZADO');
    expect(await caso(jest.fn(async () => respuesta(401, {})))).toBe('RECHAZADO');
    expect(await caso(jest.fn(async () => respuesta(429, {})))).toBe('NO_DISPONIBLE');
    expect(await caso(jest.fn(async () => respuesta(503, {})))).toBe('NO_DISPONIBLE');
    expect(await caso(jest.fn(async () => respuesta(200, {})))).toBe('NO_DISPONIBLE');
    expect(await caso(jest.fn(async () => { throw new Error('ECONNRESET'); }))).toBe('NO_DISPONIBLE');
  });

  it('los errores nunca contienen la llave, el correo ni el cuerpo crudo del proveedor', async () => {
    const e: any = await new ResendCorreoProvider(ENV, jest.fn(async () => respuesta(422, { message: 'invalid to ana@gym.mx' })) as any).enviar(msg).catch((x) => x);
    expect(e.message).not.toMatch(/re_llave_secreta_123|ana@gym\.mx|invalid to/);
    const f: any = await new ResendCorreoProvider(ENV, jest.fn(async () => { throw new Error('fetch a https://api.resend.com con re_llave_secreta_123'); }) as any).enviar(msg).catch((x) => x);
    expect(f.message).not.toContain('re_llave_secreta_123');
  });

  it('tiempo de espera: si el proveedor no responde, aborta y es NO_DISPONIBLE', async () => {
    const colgado = jest.fn((_u: any, init: any) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('abortado')))));
    const e: any = await new ResendCorreoProvider(ENV, colgado as any, 20).enviar(msg).catch((x) => x);
    expect(e.codigo).toBe('NO_DISPONIBLE');
  });
});

describe('factory', () => {
  it('mock por defecto; resend por nombre; un nombre desconocido cae en mock (nunca envía por accidente)', () => {
    expect(crearCorreoProvider(undefined).nombre).toBe('mock');
    expect(crearCorreoProvider('Resend').nombre).toBe('resend');
    expect(crearCorreoProvider('postmark-aun-no-existe').nombre).toBe('mock');
  });
});

describe('plantilla de activación', () => {
  it('enlace con el token en el fragmento, sin duplicar query ni fragmentos de la base', () => {
    expect(enlaceActivacion('https://app.x.mx/prueba/activar', 'abc_-')).toBe('https://app.x.mx/prueba/activar#token=abc_-');
    expect(enlaceActivacion('https://app.x.mx/prueba/activar?utm=1#viejo', 't')).toBe('https://app.x.mx/prueba/activar#token=t');
  });
  it('escapa HTML en nombre y enlaces', () => {
    const p = plantillaActivacion({ nombre: '"><script>x</script>', enlace: 'https://a.mx/#token=1&b=2', avisoUrl: 'https://aviso.mx/?a=1&b="2"' });
    expect(p.html).not.toContain('<script>');
    expect(p.html).toContain('&amp;b=2');
    expect(p.html).not.toContain('"2"');
  });
});

describe('variablesFaltantes', () => {
  const completo = { PRUEBA_PUBLICA_SAL: 's'.repeat(16), ENCRYPTION_KEY: 'k'.repeat(32), TURNSTILE_SECRET: 'x', PRUEBA_AVISO_URL: 'https://a.mx/aviso', PRUEBA_AVISO_VERSION: 'v1', PRUEBA_PUBLICA_URL_BASE: 'https://app.mx/prueba', CORREO_PROVIDER: 'resend', RESEND_API_KEY: 're_x', CORREO_REMITENTE: 'a@b.mx' } as NodeJS.ProcessEnv;
  it('completo → nada falta', () => expect(variablesFaltantes(completo)).toEqual([]));
  it('lista solo NOMBRES, nunca valores', () => {
    const f = variablesFaltantes({ ...completo, TURNSTILE_SECRET: undefined, ENCRYPTION_KEY: 'corta', PRUEBA_AVISO_URL: 'http://inseguro.mx' });
    expect(f.map((x) => x.split(' ')[0])).toEqual(['ENCRYPTION_KEY', 'TURNSTILE_SECRET', 'PRUEBA_AVISO_URL']);
    expect(JSON.stringify(f)).not.toMatch(/corta|inseguro/);
  });
  it('el mock solo vale en test/development: producción, vacío o sin definir NO (Railway puede traer NODE_ENV vacío)', () => {
    const sinCorreo = { ...completo, CORREO_PROVIDER: 'mock' };
    for (const entorno of ['production', '', undefined]) expect(variablesFaltantes({ ...sinCorreo, NODE_ENV: entorno } as any)).toHaveLength(1);
    for (const entorno of ['test', 'development']) expect(variablesFaltantes({ ...sinCorreo, NODE_ENV: entorno } as any)).toEqual([]);
  });
});
