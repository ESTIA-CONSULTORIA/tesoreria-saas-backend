import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ListaEsperaService, MENSAJE_AVISO } from './lista-espera.service';
import { PruebaPublicaController } from './prueba-publica.controller';
import { descifrarSecreto } from '../facturacion/csd-crypto';
import { GIROS_PRUEBA, GIROS_PROXIMOS, MAX_AVISOS_DIA, MAX_AVISOS_POR_IP_HORA } from './prueba-publica.config';

const AHORA = new Date('2026-10-18T12:00:00Z');
const MS_HORA = 3_600_000;
const coincide = (f: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => k === 'createdAt' || f[k] === v);

function repo(filas: any[], falla = false) {
  return {
    filas,
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { if (falla) throw Object.assign(new Error('relation "pruebas_lista_espera" does not exist'), { name: 'QueryFailedError' }); const n = { id: `a-${filas.length + 1}`, createdAt: new Date(AHORA), ...d }; filas.push(n); return n; }),
    find: jest.fn(async ({ where }: any = {}) => { if (falla) throw Object.assign(new Error('relation "pruebas_lista_espera" does not exist'), { name: 'QueryFailedError' }); return filas.filter((f) => coincide(f, where)); }),
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
  };
}

const ENV = { ...process.env };
function montar(opts: { captcha?: boolean; tablaFalla?: boolean } = {}) {
  const lista = repo([], opts.tablaFalla);
  const captcha = { verificar: jest.fn(async () => opts.captcha !== false) };
  const svc = new ListaEsperaService(lista as any, captcha as any);
  return { svc, lista, captcha };
}
const ok = { correo: 'Ana@Negocio.mx', giro: 'restaurante', aceptaAviso: true, captcha: 'tok' };

describe('ListaEsperaService (avísame cuando esté listo mi giro)', () => {
  beforeEach(() => {
    process.env.PRUEBA_PUBLICA_ACTIVA = 'true';
    process.env.PRUEBA_PUBLICA_SAL = 's'.repeat(24);
    process.env.ENCRYPTION_KEY = 'k'.repeat(40);
    process.env.TURNSTILE_SECRET = 'x';
    process.env.PRUEBA_AVISO_URL = 'https://aviso.example/privacidad';
    process.env.PRUEBA_AVISO_VERSION = 'v2';
    process.env.PRUEBA_PUBLICA_URL_BASE = 'https://app.example/prueba/activar';
    process.env.NODE_ENV = 'test';
    process.env.CORREO_PROVIDER = 'mock';
  });
  afterAll(() => { process.env = { ...ENV }; });

  it('apagada → 404 y no toca nada (ni captcha ni base)', async () => {
    delete process.env.PRUEBA_PUBLICA_ACTIVA;
    const m = montar();
    await expect(m.svc.avisar(ok, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(NotFoundException);
    expect(m.captcha.verificar).not.toHaveBeenCalled();
    expect(m.lista.find).not.toHaveBeenCalled();
  });

  it('encendida pero mal configurada → 503 sin operar', async () => {
    delete process.env.TURNSTILE_SECRET;
    const m = montar();
    await expect(m.svc.avisar(ok, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(m.lista.save).not.toHaveBeenCalled();
  });

  it('guarda SOLO la solicitud: correo cifrado + hash, consentimiento estampado por el servidor, sin cuenta ni negocio', async () => {
    const m = montar();
    const r = await m.svc.avisar({ ...ok, avisoAceptadoEn: new Date(0), avisoVersion: 'falsa' } as any, '9.9.9.9', AHORA);
    expect(r.mensaje).toBe(MENSAJE_AVISO);
    expect(m.lista.filas).toHaveLength(1);
    const f = m.lista.filas[0];
    expect(Object.keys(f).sort()).toEqual(['avisadoEn', 'avisoAceptadoEn', 'avisoUrl', 'avisoVersion', 'correoCifrado', 'correoDominio', 'correoHash', 'createdAt', 'giro', 'id', 'ip'].sort());
    expect(f.correoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.correoCifrado).toMatch(/^v2:gcm:/);
    expect(descifrarSecreto(f.correoCifrado, 'prueba|aviso-giro')).toBe('ana@negocio.mx');
    expect(JSON.stringify(f)).not.toMatch(/ana@negocio\.mx/i);
    expect(f).toMatchObject({ giro: 'restaurante', correoDominio: 'negocio.mx', avisoVersion: 'v2', avisoUrl: 'https://aviso.example/privacidad', ip: '9.9.9.9', avisadoEn: null });
    expect(f.avisoAceptadoEn).toEqual(AHORA); // no lo que mande el cliente
  });

  it('exige el aviso de privacidad aceptado (true exacto), correo válido, no desechable y captcha', async () => {
    const m = montar();
    for (const malo of [{ aceptaAviso: false }, { aceptaAviso: 'true' }, { aceptaAviso: undefined }]) {
      await expect(m.svc.avisar({ ...ok, ...(malo as any) }, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(m.svc.avisar({ ...ok, correo: 'no-es-correo' }, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
    await expect(m.svc.avisar({ ...ok, correo: 'a@mailinator.com' }, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
    const sin = montar({ captcha: false });
    await expect(sin.svc.avisar(ok, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
    expect(m.lista.filas).toHaveLength(0);
    expect(sin.lista.filas).toHaveLength(0);
  });

  it('solo giros próximos: el gimnasio (que ya tiene prueba) y cualquier otro valor se rechazan', async () => {
    const m = montar();
    expect([...GIROS_PROXIMOS].some((g) => (GIROS_PRUEBA as readonly string[]).includes(g))).toBe(false);
    for (const g of ['gimnasio', 'inventado', '', undefined]) {
      await expect(m.svc.avisar({ ...ok, giro: g as any }, '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const g of GIROS_PROXIMOS) await m.svc.avisar({ ...ok, correo: `a-${g}@negocio.mx`, giro: g }, '1.1.1.1', AHORA);
    expect(m.lista.filas).toHaveLength(GIROS_PROXIMOS.length);
  });

  it('respuesta idéntica si el correo ya estaba (no se enumera) y no duplica la fila', async () => {
    const m = montar();
    const a = await m.svc.avisar(ok, '1.1.1.1', AHORA);
    const b = await m.svc.avisar({ ...ok, correo: ' ANA@negocio.mx ' }, '2.2.2.2', AHORA);
    expect(b).toEqual(a);
    expect(m.lista.filas).toHaveLength(1);
    // mismo correo, otro giro = otra solicitud
    await m.svc.avisar({ ...ok, giro: 'retail' }, '1.1.1.1', AHORA);
    expect(m.lista.filas).toHaveLength(2);
  });

  it(`tope por IP (${MAX_AVISOS_POR_IP_HORA}/hora) → 429 y tope diario (${MAX_AVISOS_DIA}) → 503`, async () => {
    const m = montar();
    for (let i = 0; i < MAX_AVISOS_POR_IP_HORA; i++) await m.svc.avisar({ ...ok, correo: `u${i}@negocio.mx` }, '5.5.5.5', AHORA);
    const e = await m.svc.avisar({ ...ok, correo: 'otro@negocio.mx' }, '5.5.5.5', AHORA).catch((x) => x);
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(429);
    await expect(m.svc.avisar({ ...ok, correo: 'otro@negocio.mx' }, '6.6.6.6', AHORA)).resolves.toBeDefined(); // otra IP sí
    // pasada la hora, la misma IP vuelve a poder
    await expect(m.svc.avisar({ ...ok, correo: 'despues@negocio.mx' }, '5.5.5.5', new Date(AHORA.getTime() + 2 * MS_HORA))).resolves.toBeDefined();

    const lleno = montar();
    for (let i = 0; i < MAX_AVISOS_DIA; i++) lleno.lista.filas.push({ id: `x${i}`, createdAt: new Date(AHORA), ip: `10.0.${i % 250}.${i % 7}`, correoHash: `h${i}`, giro: 'retail' });
    const d = await lleno.svc.avisar({ ...ok, correo: 'nuevo@negocio.mx' }, '7.7.7.7', AHORA).catch((x) => x);
    expect(d).toBeInstanceOf(ServiceUnavailableException);
  });

  it('si la tabla aún no existe (SQL sin correr): 503 genérico, sin detalles internos ni el correo', async () => {
    const m = montar({ tablaFalla: true });
    const e = await m.svc.avisar(ok, '1.1.1.1', AHORA).catch((x) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(e.getResponse())).not.toMatch(/relation|pruebas_lista_espera|ana@/i);
  });

  it('el endpoint POST /prueba/avisame delega con la IP y el cuerpo, y sin cuerpo no truena', async () => {
    const llamado: any[] = [];
    const lista: any = { avisar: (b: any, ip: string) => { llamado.push([b, ip]); return { mensaje: 'x' }; } };
    const c = new PruebaPublicaController({} as any, lista);
    c.avisame(undefined, { headers: {}, ip: '3.3.3.3' });
    expect(llamado[0][0]).toEqual({});
  });
});
