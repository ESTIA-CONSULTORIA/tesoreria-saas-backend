import { Logger } from '@nestjs/common';
import { PruebaCicloService, avisosDebidos, tipoAviso } from './prueba-ciclo.service';
import { MockCorreoProvider } from './correo/mock-correo.provider';
import { plantillaAviso, CORREO_CONTACTO_PRUEBA } from './correo/plantilla-aviso';
import { DIAS_AVISO, DIAS_PRUEBA, MAX_DIAS_PURGA, PURGA_LOTE, RETENCION_DIAS } from './prueba-publica.config';
import { PruebaPublicaService } from './prueba-publica.service';

const MS_DIA = 86_400_000;
const AHORA = new Date('2026-11-20T15:00:00Z');
const desde = (d: number) => new Date(AHORA.getTime() + d * MS_DIA); // d días a partir de AHORA (negativo = pasado)
const coincide = (f: any, where: any) => Object.entries(where ?? {}).every(([k, v]) => f[k] === v);

function repo(filas: any[] = []) {
  let n = 0;
  return {
    filas,
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => { const nueva = { id: `r-${++n}`, createdAt: new Date(AHORA), ...d }; filas.push(nueva); return nueva; }),
    find: jest.fn(async ({ where }: any = {}) => filas.filter((f) => coincide(f, where))),
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
    update: jest.fn(async (where: any, patch: any) => { const hit = filas.filter((f) => coincide(f, where)); hit.forEach((f) => Object.assign(f, patch)); return { affected: hit.length }; }),
    delete: jest.fn(async (where: any) => { for (const f of filas.filter((x) => coincide(x, where))) filas.splice(filas.indexOf(f), 1); }),
  };
}

// Tabla de eventos con la restricción única (pruebaId, tipo), como la de la base.
function repoEventos() {
  const r = repo();
  const guardar = r.save.getMockImplementation()!;
  r.save.mockImplementation(async (d: any) => {
    if (r.filas.some((f) => f.pruebaId === d.pruebaId && f.tipo === d.tipo)) throw Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    return guardar(d);
  });
  return r;
}

const prueba = (id: string, over: Record<string, any> = {}) => ({ id, tenantId: `t-${id}`, estado: 'ACTIVA', nombrePersona: 'Ana', avisoUrl: 'https://aviso.ejemplo.mx/privacidad', venceEn: desde(4), giro: 'retail', ...over });

function montar(opts: { correoFalla?: 'RECHAZADO' | 'NO_DISPONIBLE' } = {}) {
  const pruebas = repo();
  const tenants = repo();
  const users = repo();
  const eventos = repoEventos();
  const correo = new MockCorreoProvider(opts.correoFalla ? { fallar: opts.correoFalla } : {});
  const svc = { marcarVencidas: jest.fn(async () => 0), purgar: jest.fn(async (_a: Date, o: any) => ({ ensayo: o.ensayo, candidatas: [], omitidas: [], purgadas: 0, fallidas: [], enRiesgo: [] })) };
  const ciclo = new PruebaCicloService(svc as unknown as PruebaPublicaService, pruebas as any, tenants as any, users as any, eventos as any, correo);
  const alta = (id: string, over: Record<string, any> = {}, plan = 'PRUEBA', admin: string | null = `${id}@neg.mx`) => {
    pruebas.filas.push(prueba(id, over));
    tenants.filas.push({ id: `t-${id}`, plan, isActive: true });
    if (admin) users.filas.push({ id: `u-${id}`, tenantId: `t-${id}`, roleCode: 'ADMIN', isActive: true, email: admin });
  };
  return { ciclo, svc, pruebas, tenants, users, eventos, correo, alta };
}

describe('avisos de fin de prueba — cuándo corresponden', () => {
  it(`los días son ${DIAS_AVISO.join(', ')}: quedan 5, 2 y el último día (≤ 1)`, () => {
    expect([...DIAS_AVISO]).toEqual([25, 28, 30]);
    expect(DIAS_PRUEBA).toBe(30);
    const venceEn = desde(0);
    const en = (restanteDias: number) => avisosDebidos(venceEn, new Date(venceEn.getTime() - restanteDias * MS_DIA));
    expect(en(10)).toEqual([]);
    expect(en(5.01)).toEqual([]);
    expect(en(5)).toEqual([25]);
    expect(en(3)).toEqual([25]);
    expect(en(2)).toEqual([25, 28]);
    expect(en(1.5)).toEqual([25, 28]);
    expect(en(1)).toEqual([25, 28, 30]);
    expect(en(0.1)).toEqual([25, 28, 30]);
  });
  it('ya vencida: no se avisa', () => {
    expect(avisosDebidos(desde(0), AHORA)).toEqual([]);
    expect(avisosDebidos(desde(-3), AHORA)).toEqual([]);
  });
  it('el tipo del aviso identifica el día', () => expect([25, 28, 30].map(tipoAviso)).toEqual(['AVISO_25', 'AVISO_28', 'AVISO_30']));
});

describe('plantilla del aviso', () => {
  const p = { nombre: 'Ana <b>', dia: 25, venceEn: new Date('2026-12-05T12:00:00Z'), avisoUrl: 'https://aviso.ejemplo.mx/privacidad' };
  it('dice la fecha, cómo seguir, el plazo de eliminación (≤ 90 días) y que solo se conserva la aceptación del aviso; escapa HTML', () => {
    const m = plantillaAviso(p);
    expect(m.asunto).toContain('5 de diciembre de 2026');
    for (const t of [m.texto, m.html]) {
      expect(t).toContain(CORREO_CONTACTO_PRUEBA);
      expect(t).toContain(`${MAX_DIAS_PURGA} días`);
      expect(t).toContain('aceptaste el aviso de privacidad');
    }
    expect(m.html).toContain('Ana &lt;b&gt;');
    expect(m.html).not.toContain('Ana <b>');
    expect(m.texto).toContain('https://aviso.ejemplo.mx/privacidad');
  });
  it('el último día lo dice con claridad', () => expect(plantillaAviso({ ...p, dia: 30 }).asunto).toBe('Hoy termina tu prueba de ESTIA'));
});

describe('enviarAvisos — idempotentes y aislados', () => {
  it('manda el aviso al ADMIN del negocio, con clave de idempotencia por (prueba, aviso)', async () => {
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    const r = await m.ciclo.enviarAvisos(AHORA);
    expect(r).toMatchObject({ enviados: 1, errores: 0 });
    expect(m.correo.enviados).toHaveLength(1);
    expect(m.correo.enviados[0]).toMatchObject({ para: 'a@neg.mx', claveIdempotencia: 'prueba:a:AVISO_25' });
    expect(m.eventos.filas).toEqual([expect.objectContaining({ pruebaId: 'a', tipo: 'AVISO_25', estado: 'ENVIADO' })]);
  });

  it('IDEMPOTENTE: correr la tarea dos, tres veces el mismo día no manda el mismo aviso otra vez', async () => {
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    await m.ciclo.enviarAvisos(AHORA);
    await m.ciclo.enviarAvisos(AHORA);
    await m.ciclo.enviarAvisos(new Date(AHORA.getTime() + 3_600_000));
    expect(m.correo.enviados).toHaveLength(1);
  });

  it('IDEMPOTENTE con dos corridas SIMULTÁNEAS: la restricción única deja pasar solo una', async () => {
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    const [r1, r2] = await Promise.all([m.ciclo.enviarAvisos(AHORA), m.ciclo.enviarAvisos(AHORA)]);
    expect(m.correo.enviados).toHaveLength(1);
    expect(r1.enviados + r2.enviados).toBe(1);
  });

  it('cada día de aviso se manda una sola vez a lo largo de la vida de la prueba: 25, luego 28, luego 30', async () => {
    const m = montar();
    m.alta('a', { venceEn: desde(5) });
    await m.ciclo.enviarAvisos(AHORA); // quedan 5 días
    await m.ciclo.enviarAvisos(new Date(AHORA.getTime() + 2 * MS_DIA)); // quedan 3
    await m.ciclo.enviarAvisos(new Date(AHORA.getTime() + 3 * MS_DIA)); // quedan 2
    await m.ciclo.enviarAvisos(new Date(AHORA.getTime() + 3.5 * MS_DIA));
    await m.ciclo.enviarAvisos(new Date(AHORA.getTime() + 4.2 * MS_DIA)); // queda menos de 1
    await m.ciclo.enviarAvisos(new Date(AHORA.getTime() + 4.9 * MS_DIA));
    expect(m.correo.enviados.map((e) => e.claveIdempotencia)).toEqual(['prueba:a:AVISO_25', 'prueba:a:AVISO_28', 'prueba:a:AVISO_30']);
  });

  it('si la tarea faltó varios días manda SOLO el más reciente y marca los anteriores OMITIDO (sin tres correos de golpe)', async () => {
    const m = montar();
    m.alta('a', { venceEn: new Date(AHORA.getTime() + 0.5 * MS_DIA) });
    const r = await m.ciclo.enviarAvisos(AHORA);
    expect(r).toMatchObject({ enviados: 1, omitidos: 2 });
    expect(m.correo.enviados.map((e) => e.claveIdempotencia)).toEqual(['prueba:a:AVISO_30']);
    expect(Object.fromEntries(m.eventos.filas.map((e) => [e.tipo, e.estado]))).toEqual({ AVISO_25: 'OMITIDO', AVISO_28: 'OMITIDO', AVISO_30: 'ENVIADO' });
    await m.ciclo.enviarAvisos(AHORA);
    expect(m.correo.enviados).toHaveLength(1);
  });

  it('si el envío falla: no queda marcado como enviado, se libera la reserva y la siguiente corrida lo reintenta', async () => {
    const m = montar({ correoFalla: 'NO_DISPONIBLE' });
    m.alta('a', { venceEn: desde(4) });
    const r1 = await m.ciclo.enviarAvisos(AHORA);
    expect(r1).toMatchObject({ enviados: 0, errores: 1 });
    expect(m.eventos.filas).toEqual([]);
    // el proveedor se recupera
    (m.correo as any).opciones = {};
    const ok = new MockCorreoProvider();
    (m.ciclo as any).correo = ok;
    const r2 = await m.ciclo.enviarAvisos(AHORA);
    expect(r2.enviados).toBe(1);
    expect(ok.enviados).toHaveLength(1);
  });

  it('un ENVIANDO viejo (la corrida se cayó antes de confirmar) se reintenta con la misma clave; uno reciente no', async () => {
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    m.eventos.filas.push({ id: 'ev', pruebaId: 'a', tipo: 'AVISO_25', estado: 'ENVIANDO', createdAt: new Date(AHORA.getTime() - 10 * 60_000) });
    expect((await m.ciclo.enviarAvisos(AHORA)).enviados).toBe(0); // otra corrida lo está haciendo
    m.eventos.filas[0].createdAt = new Date(AHORA.getTime() - 3 * 3_600_000);
    expect((await m.ciclo.enviarAvisos(AHORA)).enviados).toBe(1);
    expect(m.correo.enviados[0].claveIdempotencia).toBe('prueba:a:AVISO_25');
    expect(m.eventos.filas[0].estado).toBe('ENVIADO');
  });

  describe('aislamiento: a quién NO se le avisa', () => {
    it.each([
      ['tenant convertido a plan de pago', { plan: 'BUSINESS' }],
      ['tenant desactivado', { isActive: false }],
    ])('%s', async (_n, cambio) => {
      const m = montar();
      m.alta('a', { venceEn: desde(4) });
      Object.assign(m.tenants.filas[0], cambio);
      await m.ciclo.enviarAvisos(AHORA);
      expect(m.correo.enviados).toHaveLength(0);
      expect(m.eventos.filas).toEqual([]);
    });
    it.each(['SOLICITADA', 'VENCIDA', 'CONVERTIDA', 'PURGADA', 'FALLIDA'])('una prueba %s no recibe avisos', async (estado) => {
      const m = montar();
      m.alta('a', { venceEn: desde(4), estado });
      await m.ciclo.enviarAvisos(AHORA);
      expect(m.correo.enviados).toHaveLength(0);
    });
    it('una prueba que aún no está en ventana, o ya venció, no recibe nada', async () => {
      const m = montar();
      m.alta('lejos', { venceEn: desde(20) });
      m.alta('vencida', { venceEn: desde(-1) });
      await m.ciclo.enviarAvisos(AHORA);
      expect(m.correo.enviados).toHaveLength(0);
    });
    it('el correo va SOLO al ADMIN activo de ese negocio: nunca a usuarios de otro negocio ni a otro rol', async () => {
      const m = montar();
      m.alta('a', { venceEn: desde(4) });
      m.alta('b', { venceEn: desde(20) }); // otro negocio, fuera de ventana
      m.users.filas.push({ id: 'cajero', tenantId: 't-a', roleCode: 'CAJERO', isActive: true, email: 'cajero@a.mx' });
      m.users.filas.push({ id: 'viejo-admin', tenantId: 't-a', roleCode: 'ADMIN', isActive: false, email: 'baja@a.mx' });
      await m.ciclo.enviarAvisos(AHORA);
      expect(m.correo.enviados.map((e) => e.para)).toEqual(['a@neg.mx']);
    });
    it('sin ADMIN activo con correo: se cuenta, no se envía ni se reserva el aviso', async () => {
      const m = montar();
      m.alta('a', { venceEn: desde(4) }, 'PRUEBA', null);
      const r = await m.ciclo.enviarAvisos(AHORA);
      expect(r.sinDestinatario).toBe(1);
      expect(m.correo.enviados).toHaveLength(0);
      expect(m.eventos.filas.filter((e) => e.estado !== 'OMITIDO')).toEqual([]);
    });
    it('un fallo con una prueba no detiene a las demás', async () => {
      const m = montar();
      m.alta('a', { venceEn: desde(4) });
      m.alta('b', { venceEn: desde(4) });
      const original = m.tenants.findOne.getMockImplementation()!;
      m.tenants.findOne.mockImplementationOnce(async () => { throw new Error('boom'); });
      const r = await m.ciclo.enviarAvisos(AHORA);
      expect(r).toMatchObject({ enviados: 1, errores: 1 });
      expect(original).toBeDefined();
    });
  });
});

describe('tareas programadas (interruptores)', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.PRUEBA_PUBLICA_ACTIVA = 'true';
    process.env.ENCRYPTION_KEY = 'k'.repeat(40);
    process.env.PRUEBA_PUBLICA_SAL = 's'.repeat(24);
    process.env.TURNSTILE_SECRET = 'secreto-de-prueba';
    process.env.PRUEBA_AVISO_URL = 'https://aviso.ejemplo.mx/privacidad';
    process.env.PRUEBA_AVISO_VERSION = '2026-10-01';
    process.env.PRUEBA_PUBLICA_URL_BASE = 'https://app.ejemplo.mx/prueba/activar';
    process.env.CORREO_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';
    delete process.env.PRUEBA_PURGA_ACTIVA;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { process.env = original; });

  it('con la prueba pública apagada no hace NADA: ni vence, ni purga, ni envía', async () => {
    process.env.PRUEBA_PUBLICA_ACTIVA = 'false';
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    expect(await m.ciclo.correrVencimientoYPurga(AHORA)).toBeNull();
    expect(await m.ciclo.correrAvisos(AHORA)).toBeNull();
    expect(m.svc.marcarVencidas).not.toHaveBeenCalled();
    expect(m.svc.purgar).not.toHaveBeenCalled();
    expect(m.correo.enviados).toHaveLength(0);
  });

  it('la purga es ENSAYO por defecto: sin PRUEBA_PURGA_ACTIVA=true solo lista', async () => {
    const m = montar();
    await m.ciclo.correrVencimientoYPurga(AHORA);
    expect(m.svc.marcarVencidas).toHaveBeenCalledWith(AHORA);
    expect(m.svc.purgar).toHaveBeenCalledWith(AHORA, { ensayo: true });
  });

  it.each(['TRUE', '1', 'si', 'false', ''])('PRUEBA_PURGA_ACTIVA=%p tampoco enciende la purga real (solo el literal "true")', async (v) => {
    process.env.PRUEBA_PURGA_ACTIVA = v;
    const m = montar();
    await m.ciclo.correrVencimientoYPurga(AHORA);
    expect(m.svc.purgar).toHaveBeenCalledWith(AHORA, { ensayo: true });
  });

  it('con PRUEBA_PURGA_ACTIVA=true la purga es real', async () => {
    process.env.PRUEBA_PURGA_ACTIVA = 'true';
    const m = montar();
    await m.ciclo.correrVencimientoYPurga(AHORA);
    expect(m.svc.purgar).toHaveBeenCalledWith(AHORA, { ensayo: false });
  });

  it('alerta (nivel ERROR con prefijo ALERTA) si una purga falla o una prueba se acerca al plazo de 90 días; la tarea no lanza', async () => {
    const m = montar();
    m.svc.purgar.mockResolvedValueOnce({ ensayo: false, candidatas: [], omitidas: [], purgadas: 0, fallidas: [{ pruebaId: 'x', error: 'boom' }], enRiesgo: [{ pruebaId: 'y', dias: 85 }] } as any);
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(m.ciclo.correrVencimientoYPurga(AHORA)).resolves.not.toBeNull();
    const textos = err.mock.calls.map((c) => String(c[0]));
    expect(textos.some((t) => t.startsWith('ALERTA purga fallida de la prueba x'))).toBe(true);
    expect(textos.some((t) => /ALERTA plazo de privacidad: la prueba y lleva 85 días/.test(t))).toBe(true);
  });

  it('si la tarea revienta, lo registra como ALERTA y devuelve null (no tumba la aplicación) y se puede volver a correr', async () => {
    const m = montar();
    m.svc.marcarVencidas.mockRejectedValueOnce(new Error('bd caída'));
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(await m.ciclo.correrVencimientoYPurga(AHORA)).toBeNull();
    expect(String(err.mock.calls[0][0])).toMatch(/^ALERTA falló la tarea de vencimiento y purga: bd caída/);
    expect(await m.ciclo.correrVencimientoYPurga(AHORA)).not.toBeNull();
  });

  it('los avisos se detienen (con ALERTA) si falta configuración, y no mandan nada', async () => {
    delete process.env.PRUEBA_AVISO_URL;
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    const err = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(await m.ciclo.correrAvisos(AHORA)).toBeNull();
    expect(String(err.mock.calls[0][0])).toMatch(/^ALERTA avisos de fin de prueba detenidos/);
    expect(m.correo.enviados).toHaveLength(0);
  });

  it('los avisos corren con la configuración completa', async () => {
    const m = montar();
    m.alta('a', { venceEn: desde(4) });
    expect(await m.ciclo.correrAvisos(AHORA)).toMatchObject({ enviados: 1 });
  });
});

describe('plazo del aviso de privacidad (90 días)', () => {
  it('la retención interna, el lote y el plazo son coherentes', () => {
    expect(MAX_DIAS_PURGA).toBe(90);
    expect(RETENCION_DIAS).toBeLessThan(MAX_DIAS_PURGA);
    expect(PURGA_LOTE).toBeGreaterThanOrEqual(20); // las altas están topadas a 20 al día: un lote cubre un día completo de vencimientos
  });
});
