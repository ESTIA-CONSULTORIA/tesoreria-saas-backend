import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PruebaPublicaService } from './prueba-publica.service';
import { MockCorreoProvider } from './correo/mock-correo.provider';
import { hashToken } from './prueba-publica.util';
import { configEstructural, modulosDeGiro } from './giros-prueba';
import { DIAS_PRUEBA, MAX_ACTIVAS, MAX_ALTAS_DIA, MAX_POR_IP_HORA, RETENCION_DIAS } from './prueba-publica.config';

const MS_DIA = 86_400_000;
const AHORA = new Date('2026-10-18T12:00:00Z');
const coincide = (f: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => f[k] === v);

function repo(filas: any[]) {
  let n = 0;
  return {
    filas,
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => {
      const nueva = { id: `p-${++n}`, createdAt: new Date(AHORA), ...d };
      filas.push(nueva);
      return nueva;
    }),
    find: jest.fn(async ({ where }: any = {}) => filas.filter((f) => coincide(f, where))),
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
    update: jest.fn(async (where: any, patch: any) => {
      const hit = filas.filter((f) => coincide(f, typeof where === 'string' ? { id: where } : where));
      hit.forEach((f) => Object.assign(f, patch)); // síncrono: dos llamadas «simultáneas» se serializan igual que el UPDATE condicional de la BD
      return { affected: hit.length };
    }),
  };
}

const KEY = 'k'.repeat(40);
const SAL = 's'.repeat(24);

function montar(opts: { captcha?: boolean; crearFalla?: boolean; crearConWarning?: boolean; correoFalla?: 'RECHAZADO' | 'NO_DISPONIBLE' } = {}) {
  const pruebas = repo([]);
  const tenants = repo([]);
  const companies = repo([]);
  const branches = repo([]);
  let nTenant = 0;
  const tenantsService = {
    create: jest.fn(async (dto: any, _limitarModulos?: readonly string[]) => {
      if (opts.crearFalla) throw new Error('boom con detalle interno');
      const id = `t-${++nTenant}`;
      tenants.filas.push({ id, plan: dto.plan, slug: dto.slug, giro: dto.giro, isActive: true });
      companies.filas.push({ id: `c-${id}`, tenantId: id });
      branches.filas.push({ id: `b-${id}`, companyId: `c-${id}` });
      return opts.crearConWarning ? { id, warning: 'No se pudieron inicializar los módulos' } : { id, slug: dto.slug };
    }),
  };
  const subscriptions = { fijarFin: jest.fn(async () => undefined) };
  const users = { filas: [] as any[], count: jest.fn(async ({ where }: any) => users.filas.filter((f) => coincide(f, where)).length) };
  const shifts = { filas: [] as any[], count: jest.fn(async ({ where }: any) => shifts.filas.filter((f) => coincide(f, where)).length) };
  const sales = { filas: [] as any[], count: jest.fn(async ({ where }: any) => sales.filas.filter((f) => coincide(f, where)).length) };
  const catalogo = { categorias: [] as Array<{ id: string; tenantId: string; name: string }>, productos: [] as Array<{ tenantId: string; name: string; price: number; esServicio?: boolean }> };
  const llamadas: Array<[string, string, any?]> = []; // [operación, tenantId, detalle]
  const socios: any[] = [];
  const settings = { upsert: jest.fn(async (t: string, body: any) => void llamadas.push(['settings', t, body])) };
  const categories = {
    create: jest.fn(async (d: any, t: string) => { llamadas.push(['categoria', t]); const id = `cat-${t}-${d.name}`; catalogo.categorias.push({ id, tenantId: t, name: d.name }); return { id }; }),
    findAll: jest.fn(async (_b: any, t: string) => catalogo.categorias.filter((c) => c.tenantId === t)),
  };
  const products = {
    create: jest.fn(async (d: any, t: string) => { llamadas.push(['producto', t]); catalogo.productos.push({ tenantId: t, name: d.name, price: d.price, esServicio: d.esServicio }); }),
    findAll: jest.fn(async (_b: any, t: string) => catalogo.productos.filter((p) => p.tenantId === t)),
  };
  const membresias = {
    crearPlan: jest.fn(async (t: string) => void llamadas.push(['plan', t])),
    crearSocio: jest.fn(async (t: string, s: any) => { llamadas.push(['socio', t]); socios.push({ tenantId: t, ...s }); }),
  };
  const captcha = { verificar: jest.fn<Promise<boolean>, [string | undefined, string]>(async () => opts.captcha !== false) };
  const correo = new MockCorreoProvider(opts.correoFalla ? { fallar: opts.correoFalla } : {});
  const purger = { purgarTenant: jest.fn<Promise<void>, [string]>(async () => undefined) };
  const svc = new PruebaPublicaService(pruebas as any, tenants as any, companies as any, branches as any, users as any, shifts as any, sales as any, tenantsService as any, subscriptions as any, settings as any, products as any, categories as any, membresias as any, captcha, correo, purger);
  return { svc, pruebas, tenants, tenantsService, subscriptions, llamadas, socios, captcha, correo, purger, users, shifts, sales, catalogo, categories, products, settings };
}

const sol = (over: Record<string, any> = {}) => ({ correo: 'Ana@Gym.mx', nombre: 'Ana', negocio: 'Gym Ana', giro: 'gimnasio', captcha: 'ok', aceptaAviso: true, ...over });

// El token viaja en el fragmento del enlace del correo (#token=…).
function tokenDelUltimoCorreo(m: ReturnType<typeof montar>): string {
  const ult = m.correo.enviados[m.correo.enviados.length - 1];
  return decodeURIComponent((ult.texto.match(/#token=([A-Za-z0-9_%-]+)/) as RegExpMatchArray)[1]);
}

async function pedirYObtenerToken(m: ReturnType<typeof montar>, over: Record<string, any> = {}, ip = '1.1.1.1', ahora = AHORA) {
  await m.svc.solicitar(sol(over), ip, ahora);
  return tokenDelUltimoCorreo(m);
}

describe('Prueba pública PP0', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.PRUEBA_PUBLICA_ACTIVA = 'true';
    process.env.ENCRYPTION_KEY = KEY;
    process.env.PRUEBA_PUBLICA_SAL = SAL;
    process.env.TURNSTILE_SECRET = 'turnstile-secret-de-prueba';
    process.env.PRUEBA_AVISO_URL = 'https://aviso.ejemplo.mx/privacidad';
    process.env.PRUEBA_AVISO_VERSION = '2026-10-01';
    process.env.PRUEBA_PUBLICA_URL_BASE = 'https://app.ejemplo.mx/prueba/activar';
    process.env.CORREO_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    process.env = original;
  });

  describe('interruptor (apagado por defecto)', () => {
    it('apagado o sin definir: solicitar y activar responden 404 y no tocan NADA', async () => {
      for (const valor of [undefined, 'false', '0', '', 'TRUE', 'si']) {
        if (valor === undefined) delete process.env.PRUEBA_PUBLICA_ACTIVA; else process.env.PRUEBA_PUBLICA_ACTIVA = valor;
        const m = montar();
        await expect(m.svc.solicitar(sol(), '1.1.1.1', AHORA)).rejects.toBeInstanceOf(NotFoundException);
        await expect(m.svc.activar({ token: 'x'.repeat(43), password: 'Segura12345' }, AHORA)).rejects.toBeInstanceOf(NotFoundException);
        expect(m.captcha.verificar).not.toHaveBeenCalled();
        expect(m.pruebas.filas).toHaveLength(0);
        expect(m.correo.enviados).toHaveLength(0);
        expect(m.tenantsService.create).not.toHaveBeenCalled();
      }
    });

    it('solo el valor exacto «true» lo enciende', async () => {
      process.env.PRUEBA_PUBLICA_ACTIVA = 'true';
      const m = montar();
      await expect(m.svc.solicitar(sol(), '1.1.1.1', AHORA)).resolves.toBeDefined();
    });
  });

  describe('solicitar', () => {
    it('guarda la solicitud sin correo ni token en claro y envía el enlace una vez', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      expect(m.pruebas.filas).toHaveLength(1);
      const fila = m.pruebas.filas[0];
      expect(fila).toMatchObject({ estado: 'SOLICITADA', giro: 'gimnasio', correoDominio: 'gym.mx', tenantId: null, ip: '1.1.1.1' });
      expect(fila.tokenHash).toBe(hashToken(token));
      expect(fila.tokenHash).not.toBe(token);
      const serializado = JSON.stringify(fila);
      expect(serializado).not.toContain('ana@gym.mx');
      expect(serializado).not.toContain(token);
      expect(fila.correoCifrado.startsWith('v2:gcm:')).toBe(true);
      expect(new Date(fila.tokenVenceEn).getTime() - AHORA.getTime()).toBe(30 * 60_000);
      expect(m.correo.enviados).toHaveLength(1);
      expect(m.correo.enviados[0].para).toBe('ana@gym.mx');
    });

    it('validaciones: correo, nombre, negocio, giro excluido, casilla del aviso, dominio desechable', async () => {
      const m = montar();
      for (const mala of [{ correo: 'no-es-correo' }, { nombre: '' }, { negocio: '' }, { giro: 'medico_dental' }, { giro: 'medico_general' }, { aceptaAviso: false }, { aceptaAviso: undefined }, { aceptaAviso: 'true' as any }, { correo: 'x@mailinator.com' }]) {
        await expect(m.svc.solicitar(sol(mala), '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(m.pruebas.filas).toHaveLength(0);
      expect(m.captcha.verificar).not.toHaveBeenCalled();
    });

    it('Turnstile obligatorio: si no verifica, no se crea ni se envía nada', async () => {
      const m = montar({ captcha: false });
      await expect(m.svc.solicitar(sol(), '1.1.1.1', AHORA)).rejects.toBeInstanceOf(BadRequestException);
      expect(m.pruebas.filas).toHaveLength(0);
      expect(m.correo.enviados).toHaveLength(0);
    });

    it('respuesta idéntica para un correo que ya tiene prueba: no enumera, no crea otra, no envía de más', async () => {
      const m = montar();
      const a = await m.svc.solicitar(sol(), '1.1.1.1', AHORA);
      const b = await m.svc.solicitar(sol({ correo: ' ANA@gym.mx ' }), '2.2.2.2', AHORA);
      expect(b).toEqual(a);
      expect(m.pruebas.filas).toHaveLength(1);
      expect(m.correo.enviados).toHaveLength(1);
    });

    it('aviso de privacidad: sin casilla NO se guarda nada; con casilla se guarda la fecha del SERVIDOR, la versión y la URL (no lo que mande el cliente)', async () => {
      const m = montar();
      await expect(m.svc.solicitar(sol({ aceptaAviso: false }), '1.1.1.1', AHORA)).rejects.toThrow(/aviso de privacidad/);
      expect(m.pruebas.filas).toHaveLength(0);
      await m.svc.solicitar(sol({ avisoAceptadoEn: '1999-01-01', avisoVersion: 'inventada', avisoUrl: 'https://otro.mx' } as any), '1.1.1.1', AHORA);
      expect(m.pruebas.filas[0]).toMatchObject({ avisoVersion: '2026-10-01', avisoUrl: 'https://aviso.ejemplo.mx/privacidad' });
      expect(new Date(m.pruebas.filas[0].avisoAceptadoEn).toISOString()).toBe(AHORA.toISOString());
    });

    it('el correo trae el enlace de activación con el token en el FRAGMENTO, el aviso de privacidad y el nombre escapado; clave de idempotencia por solicitud', async () => {
      const m = montar();
      await m.svc.solicitar(sol({ nombre: '<b>Ana</b>' }), '1.1.1.1', AHORA);
      const c = m.correo.enviados[0];
      expect(c.asunto).toBe('Activa tu prueba de ESTIA');
      expect(c.texto).toContain('Hola <b>Ana</b>,');
      expect(c.html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;');
      expect(c.texto).toContain('https://app.ejemplo.mx/prueba/activar#token=');
      expect(c.texto).toMatch(/#token=[A-Za-z0-9_-]{43}(\s|$)/);
      expect(c.texto).not.toContain('?token=');
      expect(c.html).toContain('https://aviso.ejemplo.mx/privacidad');
      expect(c.claveIdempotencia).toBe('prueba-activacion:p-1');
    });

    it('si el proveedor de correo falla: 503, la solicitud queda FALLIDA sin correo ni token guardados, y la persona puede pedir otra', async () => {
      for (const fallo of ['RECHAZADO', 'NO_DISPONIBLE'] as const) {
        const m = montar({ correoFalla: fallo });
        const err: any = await m.svc.solicitar(sol(), '1.1.1.1', AHORA).catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(m.pruebas.filas[0]).toMatchObject({ estado: 'FALLIDA', correoCifrado: null, tokenHash: null });
        // FALLIDA no cuenta como activa ni bloquea el correo
        const m2 = montar();
        m2.pruebas.filas.push(m.pruebas.filas[0]);
        await expect(m2.svc.solicitar(sol(), '2.2.2.2', AHORA)).resolves.toBeDefined();
      }
    });

    describe('límites (50 activas · 20 altas/día · 3 por IP/hora)', () => {
      it(`${MAX_POR_IP_HORA} por IP en una hora; la siguiente 429; otra IP sí pasa; pasada la hora, de nuevo`, async () => {
        const m = montar();
        for (let i = 0; i < MAX_POR_IP_HORA; i++) await m.svc.solicitar(sol({ correo: `u${i}@gym.mx` }), '9.9.9.9', AHORA);
        const err: any = await m.svc.solicitar(sol({ correo: 'otro@gym.mx' }), '9.9.9.9', AHORA).catch((e) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        await expect(m.svc.solicitar(sol({ correo: 'otro@gym.mx' }), '8.8.8.8', AHORA)).resolves.toBeDefined();
        const luego = new Date(AHORA.getTime() + 61 * 60_000);
        m.pruebas.filas.forEach((f) => (f.createdAt = new Date(AHORA)));
        await expect(m.svc.solicitar(sol({ correo: 'nuevo@gym.mx' }), '9.9.9.9', luego)).resolves.toBeDefined();
      });

      it(`tope de ${MAX_ALTAS_DIA} altas por día → 503 con lista de espera`, async () => {
        const m = montar();
        for (let i = 0; i < MAX_ALTAS_DIA; i++) await m.svc.solicitar(sol({ correo: `u${i}@gym.mx` }), `10.0.0.${i}`, AHORA);
        const err: any = await m.svc.solicitar(sol({ correo: 'tarde@gym.mx' }), '10.0.1.1', AHORA).catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getResponse()).toMatchObject({ listaDeEspera: true });
        const manana = new Date(AHORA.getTime() + MS_DIA);
        await expect(m.svc.solicitar(sol({ correo: 'tarde@gym.mx' }), '10.0.1.1', manana)).resolves.toBeDefined();
      });

      it(`tope de ${MAX_ACTIVAS} pruebas activas simultáneas → 503`, async () => {
        const m = montar();
        for (let i = 0; i < MAX_ACTIVAS; i++) m.pruebas.filas.push({ id: `x${i}`, estado: 'ACTIVA', correoHash: `h${i}`, ip: `z${i}`, createdAt: new Date(AHORA.getTime() - 5 * MS_DIA) });
        const err: any = await m.svc.solicitar(sol(), '1.1.1.1', AHORA).catch((e) => e);
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getResponse()).toMatchObject({ listaDeEspera: true });
      });

      it('las pruebas vencidas, purgadas o fallidas no cuentan como activas', async () => {
        const m = montar();
        for (let i = 0; i < MAX_ACTIVAS; i++) m.pruebas.filas.push({ id: `x${i}`, estado: i % 3 === 0 ? 'VENCIDA' : i % 3 === 1 ? 'PURGADA' : 'FALLIDA', correoHash: `h${i}`, ip: `z${i}`, createdAt: new Date(AHORA.getTime() - 5 * MS_DIA) });
        await expect(m.svc.solicitar(sol(), '1.1.1.1', AHORA)).resolves.toBeDefined();
      });
    });
  });

  describe('configuración incompleta: encendida pero sin variables → 503 y no hace nada', () => {
    const variables = ['PRUEBA_PUBLICA_SAL', 'ENCRYPTION_KEY', 'TURNSTILE_SECRET', 'PRUEBA_AVISO_URL', 'PRUEBA_AVISO_VERSION', 'PRUEBA_PUBLICA_URL_BASE'];
    it.each(variables)('sin %s', async (v) => {
      delete process.env[v];
      const m = montar();
      await expect(m.svc.solicitar(sol(), '1.1.1.1', AHORA)).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(m.svc.activar({ token: 'x'.repeat(43), password: 'MiClaveSegura1' }, AHORA)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.pruebas.filas).toHaveLength(0);
      expect(m.captcha.verificar).not.toHaveBeenCalled();
      expect(m.correo.enviados).toHaveLength(0);
    });

    it('el adaptador mock no se permite en producción; con Resend exige su llave y remitente', async () => {
      process.env.NODE_ENV = 'production';
      await expect(montar().svc.solicitar(sol(), '1.1.1.1', AHORA)).rejects.toBeInstanceOf(ServiceUnavailableException);
      process.env.CORREO_PROVIDER = 'resend';
      await expect(montar().svc.solicitar(sol(), '1.1.1.1', AHORA)).rejects.toBeInstanceOf(ServiceUnavailableException);
      process.env.RESEND_API_KEY = 're_x';
      process.env.CORREO_REMITENTE = 'ESTIA <prueba@mail.ejemplo.mx>';
      await expect(montar().svc.solicitar(sol(), '1.1.1.1', AHORA)).resolves.toBeDefined();
    });
  });

  describe('activar: token de un solo uso', () => {
    it('crea el tenant PRUEBA VACÍO (solo lo estructural), con la vigencia de DIAS_PRUEBA, y deja la solicitud ACTIVA sin correo ni token', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      const r = await m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA);
      expect(r.slug).toMatch(/^prueba-[0-9a-f]{10}$/);
      expect(r.venceEn.getTime() - AHORA.getTime()).toBe(DIAS_PRUEBA * MS_DIA);

      const dto = m.tenantsService.create.mock.calls[0][0];
      expect(dto).toMatchObject({ plan: 'PRUEBA', giro: 'gimnasio', email: 'ana@gym.mx', ownerName: 'Ana', legalName: 'Gym Ana' });
      expect(dto.password).toBe('MiClaveSegura1');
      expect(m.subscriptions.fijarFin).toHaveBeenCalledWith('t-1', r.venceEn);

      const fila = m.pruebas.filas[0];
      expect(fila).toMatchObject({ estado: 'ACTIVA', tenantId: 't-1', tokenHash: null, correoCifrado: null });
      expect(JSON.stringify(fila)).not.toContain('MiClaveSegura1');
      // nace vacío: 1 configuración estructural y NADA más (sin categorías, productos, planes ni socios)
      const cuenta = (op: string) => m.llamadas.filter(([o]) => o === op).length;
      expect([cuenta('settings'), cuenta('categoria'), cuenta('producto'), cuenta('plan'), cuenta('socio')]).toEqual([1, 0, 0, 0, 0]);
      expect(Object.keys(r).sort()).toEqual(['slug', 'venceEn']);
    });

    it('pasa a TenantsService.create los módulos de SU giro (segundo argumento interno), no los del plan completo', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      await m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA);
      const dto = m.tenantsService.create.mock.calls[0][0];
      const limitar = [...((m.tenantsService.create.mock.calls[0][1] as readonly string[] | undefined) ?? [])];
      expect([...limitar].sort()).toEqual(modulosDeGiro('gimnasio').sort());
      expect(limitar).toContain('membresias');
      expect(limitar).not.toContain('costos');
      expect(Object.keys(dto)).not.toContain('modulos'); // el DTO no lleva módulos: no hay vía pública para pedirlos
    });

    it('un solo uso: el mismo enlace dos veces → la segunda falla y NO crea un segundo tenant', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      await m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA);
      await expect(m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA)).rejects.toThrow(/no es válido o ya venció/);
      expect(m.tenantsService.create).toHaveBeenCalledTimes(1);
    });

    it('carrera: dos activaciones simultáneas con el mismo enlace → exactamente una gana', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      const r = await Promise.allSettled([m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA), m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA)]);
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(r.filter((x) => x.status === 'rejected')).toHaveLength(1);
      expect(m.tenantsService.create).toHaveBeenCalledTimes(1);
    });

    it('vence a los 30 minutos; inexistente, manipulado o vacío dan el MISMO error', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      const tarde = new Date(AHORA.getTime() + 31 * 60_000);
      const mensajes = new Set<string>();
      for (const [t, ahora] of [[token, tarde], ['a'.repeat(43), AHORA], [token.slice(0, -2) + 'zz', AHORA], ['corto', AHORA], [undefined, AHORA]] as Array<[any, Date]>) {
        const e: any = await m.svc.activar({ token: t, password: 'MiClaveSegura1' }, ahora).catch((x) => x);
        expect(e).toBeInstanceOf(BadRequestException);
        mensajes.add(e.message);
      }
      expect([...mensajes]).toEqual(['El enlace no es válido o ya venció. Pide uno nuevo.']);
      expect(m.tenantsService.create).not.toHaveBeenCalled();
    });

    it('el token de una solicitud no activa la de otra persona', async () => {
      const m = montar();
      const tokenA = await pedirYObtenerToken(m, { correo: 'a@gym.mx', negocio: 'Gym A' }, '1.1.1.1');
      await pedirYObtenerToken(m, { correo: 'b@gym.mx', negocio: 'Gym B' }, '2.2.2.2');
      await m.svc.activar({ token: tokenA, password: 'MiClaveSegura1' }, AHORA);
      const dto = m.tenantsService.create.mock.calls[0][0];
      expect(dto).toMatchObject({ legalName: 'Gym A', email: 'a@gym.mx' });
      const [a, b] = m.pruebas.filas;
      expect(a.estado).toBe('ACTIVA');
      expect(b).toMatchObject({ estado: 'SOLICITADA', tenantId: null });
      expect(b.tokenHash).not.toBeNull(); // la de B sigue intacta
    });

    it('contraseña débil: 400 y el enlace NO se consume', async () => {
      const m = montar();
      const token = await pedirYObtenerToken(m);
      for (const mala of ['corta1', 'sololetrasenlargo', '12345678901', undefined]) {
        await expect(m.svc.activar({ token, password: mala as any }, AHORA)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(m.pruebas.filas[0].tokenHash).toBe(hashToken(token));
      await expect(m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA)).resolves.toBeDefined();
    });

    it('si falla la creación: FALLIDA, sin correo guardado, error genérico sin detalles internos, y el enlace ya no sirve', async () => {
      const m = montar({ crearFalla: true });
      const token = await pedirYObtenerToken(m);
      const e: any = await m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA).catch((x) => x);
      expect(e).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify(e.getResponse())).not.toContain('boom');
      expect(m.pruebas.filas[0]).toMatchObject({ estado: 'FALLIDA', correoCifrado: null, tokenHash: null });
      await expect(m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('si los módulos no se inicializaron (plan PRUEBA sin sembrar) el tenant queda DESACTIVADO y la solicitud FALLIDA', async () => {
      const m = montar({ crearConWarning: true });
      const token = await pedirYObtenerToken(m);
      await expect(m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.tenants.filas[0].isActive).toBe(false);
      expect(m.pruebas.filas[0].estado).toBe('FALLIDA');
      expect(m.subscriptions.fijarFin).not.toHaveBeenCalled();
    });
  });

  describe('giros: cada uno nace con su estructura, vacío, y aislado de los demás', () => {
    const GIRO_PRUEBA = ['gimnasio', 'restaurante', 'retail', 'generico'] as const;
    const activar = async (m: ReturnType<typeof montar>, giro: string, correo = 'ana@neg.mx') => {
      const token = await pedirYObtenerToken(m, { giro, correo, negocio: `Neg ${giro}` }, '1.1.1.' + Math.floor(Math.random() * 200 + 1));
      return m.svc.activar({ token, password: 'MiClaveSegura1' }, AHORA);
    };
    const tenantDe = (m: ReturnType<typeof montar>, i = 0) => m.tenants.filas[i].id as string;

    it.each(GIRO_PRUEBA)('%s: la solicitud se acepta y el tenant nace con giro, plan PRUEBA e IVA 16 %% sin incluir', async (giro) => {
      const m = montar();
      await activar(m, giro);
      expect(m.tenantsService.create.mock.calls[0][0]).toMatchObject({ giro, plan: 'PRUEBA' });
      const cfg = m.llamadas.find(([o]) => o === 'settings')![2];
      expect(cfg).toMatchObject({ ivaTasaDefault: '16', preciosIncluyenIva: false, stockPolicy: 'PERMITIR_NEGATIVO' });
      expect(cfg.posCapabilities).toEqual(configEstructural(giro).posCapabilities);
      // vacío: ninguna categoría, producto, plan ni socio
      expect(m.llamadas.filter(([o]) => o !== 'settings')).toHaveLength(0);
    });

    it('capacidades por giro: gimnasio con membresías, restaurante con mesas y cocina, tienda y genérico con venta directa', () => {
      expect(configEstructural('gimnasio').posCapabilities).toEqual({ membresias: true, venta_de_servicio: true });
      expect(configEstructural('restaurante').posCapabilities).toEqual({ mesas_cuenta_abierta: true, notas_cocina_barra: true });
      expect(configEstructural('retail').posCapabilities).toEqual({ venta_directa_producto: true });
      expect(configEstructural('generico').posCapabilities).toEqual({ venta_directa_producto: true });
    });

    it('los giros excluidos (médicos) y los inventados se rechazan al solicitar', async () => {
      const m = montar();
      for (const giro of ['medico_dental', 'medico_general', 'inventado', '']) {
        await expect(m.svc.solicitar(sol({ giro }), '9.9.9.9', AHORA)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(m.pruebas.filas).toHaveLength(0);
    });

    describe('POST /prueba/datos-ejemplo (opcional, solo SU tenant, una vez)', () => {
      it.each([['restaurante', 7], ['retail', 7], ['generico', 5]] as const)('%s: siembra su plantilla mínima (%i productos, 5 a 8) solo en su tenant', async (giro, n) => {
        const m = montar();
        await activar(m, giro);
        const t = tenantDe(m);
        const r = await m.svc.datosEjemplo(t);
        expect(r).toMatchObject({ giro, productos: n, planes: 0, socios: 0 });
        expect(r.productos).toBeGreaterThanOrEqual(5);
        expect(r.productos).toBeLessThanOrEqual(8);
        expect(r.socioNip).toBeUndefined();
        expect(m.catalogo.productos.every((p) => p.tenantId === t)).toBe(true);
        expect(m.catalogo.categorias.every((c) => c.tenantId === t)).toBe(true);
        expect(m.catalogo.productos).toHaveLength(n);
      });

      it('gimnasio: la plantilla conocida (2 categorías, 5 productos, 2 planes, 1 socio) y el NIP sale UNA vez, aleatorio y sin guardarse', async () => {
        const m = montar();
        await activar(m, 'gimnasio');
        const t = tenantDe(m);
        const espia = [jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn'), jest.spyOn(process.stdout, 'write'), jest.spyOn(process.stderr, 'write')];
        const r = await m.svc.datosEjemplo(t);
        const escrito = espia.flatMap((e) => e.mock.calls.map((c) => String(c[0]))).join('\n');
        espia.forEach((e) => e.mockRestore());
        expect(r).toMatchObject({ giro: 'gimnasio', categorias: 2, productos: 5, planes: 2, socios: 1, socioNumero: '1' });
        expect(r.socioNip).toMatch(/^\d{4}$/);
        expect(r.socioNip).not.toBe('4321');
        expect(m.socios).toHaveLength(1);
        expect(m.socios[0]).toMatchObject({ tenantId: t, nip: r.socioNip });
        expect(escrito).not.toContain(r.socioNip as string);
        expect(JSON.stringify(m.pruebas.filas)).not.toContain('"' + r.socioNip + '"');
        expect(JSON.stringify(m.tenants.filas)).not.toContain(r.socioNip as string);
      });

      it('una sola vez: con productos o categorías ya creados → 409 y no siembra nada más', async () => {
        const m = montar();
        await activar(m, 'retail');
        const t = tenantDe(m);
        await m.svc.datosEjemplo(t);
        const antes = m.catalogo.productos.length;
        await expect(m.svc.datosEjemplo(t)).rejects.toBeInstanceOf(ConflictException);
        expect(m.catalogo.productos).toHaveLength(antes);
        // y si el negocio ya hizo lo suyo a mano, tampoco
        const m2 = montar();
        await activar(m2, 'restaurante');
        m2.catalogo.productos.push({ tenantId: tenantDe(m2), name: 'Mío', price: 10 });
        await expect(m2.svc.datosEjemplo(tenantDe(m2))).rejects.toBeInstanceOf(ConflictException);
      });

      it('AISLAMIENTO: dos negocios de giros distintos; cargar el de uno no toca al otro, ni en datos ni en conteos', async () => {
        const m = montar();
        await activar(m, 'restaurante', 'a@neg.mx');
        await activar(m, 'retail', 'b@neg.mx');
        const [tA, tB] = [tenantDe(m, 0), tenantDe(m, 1)];
        await m.svc.datosEjemplo(tA);
        expect(m.catalogo.productos.filter((p) => p.tenantId === tB)).toHaveLength(0);
        expect(m.catalogo.categorias.filter((c) => c.tenantId === tB)).toHaveLength(0);
        expect((await m.svc.progreso(tB)).productos).toBe(0);
        expect((await m.svc.progreso(tB)).puedeCargarEjemplo).toBe(true);
        expect((await m.svc.progreso(tA)).productos).toBe(7);
        // toda llamada de siembra llevó el tenant A
        expect(m.llamadas.filter(([o]) => o === 'producto' || o === 'categoria').every(([, t]) => t === tA)).toBe(true);
      });

      it('solo una prueba VIVA: un negocio sin prueba, una solicitud pendiente, el interruptor apagado o sin tenant → 404 sin tocar nada', async () => {
        const m = montar();
        await expect(m.svc.datosEjemplo('t-que-no-existe')).rejects.toBeInstanceOf(NotFoundException);
        await expect(m.svc.datosEjemplo(undefined as any)).rejects.toBeInstanceOf(NotFoundException);
        await pedirYObtenerToken(m); // SOLICITADA, sin tenant
        await expect(m.svc.datosEjemplo('t-1')).rejects.toBeInstanceOf(NotFoundException);
        expect(m.catalogo.productos).toHaveLength(0);
        await activar(m, 'retail', 'c@neg.mx');
        process.env.PRUEBA_PUBLICA_ACTIVA = 'false';
        await expect(m.svc.datosEjemplo(tenantDe(m))).rejects.toBeInstanceOf(NotFoundException);
        await expect(m.svc.progreso(tenantDe(m))).rejects.toBeInstanceOf(NotFoundException);
      });

      it('si la siembra falla: 503 genérico sin detalles internos', async () => {
        const m = montar();
        await activar(m, 'retail');
        m.categories.create.mockRejectedValueOnce(new Error('boom con detalle interno'));
        const e: any = await m.svc.datosEjemplo(tenantDe(m)).catch((x) => x);
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        expect(JSON.stringify(e.getResponse())).not.toContain('boom');
      });
    });

    describe('GET /prueba/progreso: conteos del tenant del token y de nadie más', () => {
      it('cuenta solo los de su tenant (categorías, productos, usuarios, turnos, cortes, ventas)', async () => {
        const m = montar();
        await activar(m, 'retail', 'a@neg.mx');
        await activar(m, 'restaurante', 'b@neg.mx');
        const [tA, tB] = [tenantDe(m, 0), tenantDe(m, 1)];
        m.users.filas.push({ tenantId: tA }, { tenantId: tA }, { tenantId: tB });
        m.shifts.filas.push({ tenantId: tA, status: 'CERRADO' }, { tenantId: tA, status: 'ABIERTO' }, { tenantId: tB, status: 'CERRADO' });
        m.sales.filas.push({ tenantId: tA }, { tenantId: tB }, { tenantId: tB });
        expect(await m.svc.progreso(tA)).toEqual({ categorias: 0, productos: 0, usuarios: 2, turnos: 2, turnosCerrados: 1, ventas: 1, puedeCargarEjemplo: true });
        expect(await m.svc.progreso(tB)).toEqual({ categorias: 0, productos: 0, usuarios: 1, turnos: 1, turnosCerrados: 1, ventas: 2, puedeCargarEjemplo: true });
      });
    });
  });


  describe('estado de MI prueba (GET /prueba/estado)', () => {
    const activa = (m: ReturnType<typeof montar>, tenantId: string, venceEn: Date, estado = 'ACTIVA') => m.pruebas.filas.push({ id: 'p-' + tenantId, tenantId, estado, venceEn, extendida: false });

    it('días restantes de la prueba del tenant del token (redondeo hacia arriba; DIAS_PRUEBA recién activada)', async () => {
      const m = montar();
      activa(m, 'T1', new Date(AHORA.getTime() + DIAS_PRUEBA * MS_DIA));
      expect(await m.svc.estado('T1', AHORA)).toMatchObject({ esPrueba: true, estado: 'ACTIVA', diasRestantes: DIAS_PRUEBA, vencida: false, extendida: false });
      expect((await m.svc.estado('T1', new Date(AHORA.getTime() + (DIAS_PRUEBA - 0.8) * MS_DIA))).diasRestantes).toBe(1);
      expect((await m.svc.estado('T1', new Date(AHORA.getTime() + (DIAS_PRUEBA - 0.01) * MS_DIA))).diasRestantes).toBe(1);
    });

    it('vencida: 0 días y vencida=true (por fecha o por estado)', async () => {
      const m = montar();
      activa(m, 'T1', new Date(AHORA.getTime() - 2 * MS_DIA), 'ACTIVA');
      activa(m, 'T2', new Date(AHORA.getTime() + 3 * MS_DIA), 'VENCIDA');
      expect(await m.svc.estado('T1', AHORA)).toMatchObject({ diasRestantes: 0, vencida: true });
      expect(await m.svc.estado('T2', AHORA)).toMatchObject({ vencida: true });
    });

    it('aislamiento: cada tenant ve SOLO la suya; uno que no es prueba, ajeno o sin tenant → 404', async () => {
      const m = montar();
      activa(m, 'T1', new Date(AHORA.getTime() + 5 * MS_DIA));
      activa(m, 'T2', new Date(AHORA.getTime() + 9 * MS_DIA));
      expect((await m.svc.estado('T1', AHORA)).diasRestantes).toBe(5);
      expect((await m.svc.estado('T2', AHORA)).diasRestantes).toBe(9);
      for (const ajeno of ['T-CLIENTE-REAL', '', undefined as any]) await expect(m.svc.estado(ajeno, AHORA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('solo filas ACTIVA/VENCIDA: una solicitud pendiente, fallida, convertida o purgada no cuenta', async () => {
      const m = montar();
      for (const estado of ['SOLICITADA', 'FALLIDA', 'CONVERTIDA', 'PURGADA']) activa(m, 'T-' + estado, new Date(AHORA.getTime() + MS_DIA), estado);
      for (const estado of ['SOLICITADA', 'FALLIDA', 'CONVERTIDA', 'PURGADA']) await expect(m.svc.estado('T-' + estado, AHORA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no expone datos personales: solo estado, fecha, días y banderas', async () => {
      const m = montar();
      m.pruebas.filas.push({ id: 'p', tenantId: 'T1', estado: 'ACTIVA', venceEn: new Date(AHORA.getTime() + MS_DIA), extendida: false, correoCifrado: 'x', correoHash: 'h', ip: '1.2.3.4', nombrePersona: 'Ana' });
      expect(Object.keys(await m.svc.estado('T1', AHORA)).sort()).toEqual(['diasRestantes', 'esPrueba', 'estado', 'extendida', 'venceEn', 'vencida']);
    });

    it('apagado → 404 aunque el tenant sea una prueba', async () => {
      const m = montar();
      activa(m, 'T1', new Date(AHORA.getTime() + MS_DIA));
      process.env.PRUEBA_PUBLICA_ACTIVA = 'false';
      await expect(m.svc.estado('T1', AHORA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('aislamiento entre pruebas', () => {
    it('dos pruebas = dos tenants distintos y la plantilla de cada una solo escribe en el suyo', async () => {
      const m = montar();
      const tA = await pedirYObtenerToken(m, { correo: 'a@gym.mx' }, '1.1.1.1');
      const tB = await pedirYObtenerToken(m, { correo: 'b@gym.mx' }, '2.2.2.2');
      const a = await m.svc.activar({ token: tA, password: 'MiClaveSegura1' }, AHORA);
      const iA = m.llamadas.length;
      const b = await m.svc.activar({ token: tB, password: 'MiClaveSegura2' }, AHORA);
      expect(a.slug).not.toBe(b.slug);
      const deA = new Set(m.llamadas.slice(0, iA).map(([, t]) => t));
      const deB = new Set(m.llamadas.slice(iA).map(([, t]) => t));
      expect([...deA]).toEqual(['t-1']);
      expect([...deB]).toEqual(['t-2']);
      expect(m.pruebas.filas.map((f) => f.tenantId)).toEqual(['t-1', 't-2']);
    });
  });

  describe('ciclo de vida y purga', () => {
    const activa = (m: ReturnType<typeof montar>, id: string, venceEn: Date, plan = 'PRUEBA', estado = 'ACTIVA') => {
      m.tenants.filas.push({ id: `t-${id}`, plan });
      m.pruebas.filas.push({ id, tenantId: `t-${id}`, estado, venceEn, correoCifrado: 'x', tokenHash: null });
    };

    it('marcarVencidas pasa a VENCIDA solo las ACTIVAS cuya fecha ya pasó', async () => {
      const m = montar();
      activa(m, 'viva', new Date(AHORA.getTime() + MS_DIA));
      activa(m, 'pasada', new Date(AHORA.getTime() - MS_DIA));
      m.pruebas.filas.push({ id: 'conv', estado: 'CONVERTIDA', venceEn: new Date(AHORA.getTime() - 99 * MS_DIA) });
      expect(await m.svc.marcarVencidas(AHORA)).toBe(1);
      expect(m.pruebas.filas.map((f) => [f.id, f.estado])).toEqual([['viva', 'ACTIVA'], ['pasada', 'VENCIDA'], ['conv', 'CONVERTIDA']]);
    });

    it(`purga solo VENCIDAS con más de ${RETENCION_DIAS} días vencidas y plan PRUEBA; por defecto es ENSAYO (no borra)`, async () => {
      const m = montar();
      const hace = (d: number) => new Date(AHORA.getTime() - d * MS_DIA);
      activa(m, 'vieja', hace(RETENCION_DIAS + 1), 'PRUEBA', 'VENCIDA');
      activa(m, 'reciente', hace(5), 'PRUEBA', 'VENCIDA');
      activa(m, 'convertida-plan', hace(100), 'BUSINESS', 'VENCIDA'); // la fila quedó VENCIDA pero el tenant ya es de pago
      activa(m, 'convertida', hace(100), 'BUSINESS', 'CONVERTIDA');
      activa(m, 'activa', hace(100), 'PRUEBA', 'ACTIVA');
      activa(m, 'purgada', hace(100), 'PRUEBA', 'PURGADA');
      m.pruebas.filas.push({ id: 'sin-tenant', tenantId: null, estado: 'VENCIDA', venceEn: hace(100) });

      const ensayo = await m.svc.purgar(AHORA);
      expect(ensayo.ensayo).toBe(true);
      expect(ensayo.candidatas).toEqual([{ pruebaId: 'vieja', tenantId: 't-vieja' }]);
      expect(Object.fromEntries(ensayo.omitidas.map((o) => [o.pruebaId, o.motivo]))).toEqual({ reciente: 'EN_RETENCION', 'convertida-plan': 'PLAN_NO_PRUEBA', 'sin-tenant': 'SIN_TENANT_O_FECHA' });
      expect(m.purger.purgarTenant).not.toHaveBeenCalled();
      expect(m.pruebas.filas.find((f) => f.id === 'vieja')!.estado).toBe('VENCIDA');

      const real = await m.svc.purgar(AHORA, { ensayo: false });
      expect(real.purgadas).toBe(1);
      expect(m.purger.purgarTenant).toHaveBeenCalledTimes(1);
      expect(m.purger.purgarTenant).toHaveBeenCalledWith('t-vieja');
      expect(m.pruebas.filas.find((f) => f.id === 'vieja')).toMatchObject({ estado: 'PURGADA', correoCifrado: null });
      for (const id of ['reciente', 'convertida-plan', 'convertida', 'activa']) expect(m.pruebas.filas.find((f) => f.id === id)!.estado).not.toBe('PURGADA');
    });

    it('un tenant que ya no existe se omite, no se purga', async () => {
      const m = montar();
      m.pruebas.filas.push({ id: 'huerfana', tenantId: 't-no-existe', estado: 'VENCIDA', venceEn: new Date(AHORA.getTime() - 200 * MS_DIA) });
      const r = await m.svc.purgar(AHORA, { ensayo: false });
      expect(r.omitidas).toEqual([{ pruebaId: 'huerfana', motivo: 'TENANT_NO_EXISTE' }]);
      expect(m.purger.purgarTenant).not.toHaveBeenCalled();
    });

    it('si el purgador falla, la prueba NO se marca PURGADA', async () => {
      const m = montar();
      activa(m, 'vieja', new Date(AHORA.getTime() - 60 * MS_DIA), 'PRUEBA', 'VENCIDA');
      m.purger.purgarTenant.mockRejectedValueOnce(new Error('falló'));
      await expect(m.svc.purgar(AHORA, { ensayo: false })).rejects.toThrow('falló');
      expect(m.pruebas.filas[0].estado).toBe('VENCIDA');
    });
  });
});
