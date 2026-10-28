import { readFileSync } from 'fs';
import { join } from 'path';
import { ShiftsService } from './shifts.service';
import { formatearFolioTurno } from './folio-turno.util';

// Horas reales del turno (abiertoEn / cerradoEn) y folio corto por tenant.
const AHORA = new Date('2026-10-28T12:00:00.000Z');

// Repositorio y manager de memoria. El manager imita lo que importa del contador en Postgres: el UPSERT toma el candado de la fila del
// tenant y lo suelta hasta que termina la transacción (commit o rollback), y un rollback devuelve el contador.
function crearEntorno(opciones: { fallaAlGuardar?: (s: any) => boolean } = {}) {
  const turnos = new Map<string, any>();
  const contador = new Map<string, number>();
  const colas = new Map<string, Promise<void>>();
  let seq = 0;

  const manager: any = {
    transaction: async (fn: (m: any) => Promise<any>) => {
      const respaldo = new Map(contador);
      let liberar: (() => void) | undefined;
      const candados: string[] = [];
      const m = {
        query: async (_sql: string, [tenantId]: [string]) => {
          const previa = colas.get(tenantId) ?? Promise.resolve();
          let suelta!: () => void;
          const mia = new Promise<void>((r) => { suelta = r; });
          colas.set(tenantId, previa.then(() => mia));
          await previa; // espera a que la transacción anterior del mismo tenant termine
          candados.push(tenantId);
          liberar = suelta;
          await new Promise((r) => setImmediate(r)); // da oportunidad a que otras altas se encimen
          const n = (contador.get(tenantId) ?? 0) + 1;
          contador.set(tenantId, n);
          return [{ ultimo: n }];
        },
        save: async (_clase: any, s: any) => {
          if (opciones.fallaAlGuardar?.(s)) throw Object.assign(new Error('boom'), { code: '08006' });
          const guardado = { ...s, id: s.id ?? `t${++seq}` };
          // índice único (tenantId, folio)
          for (const o of turnos.values()) if (o.tenantId === guardado.tenantId && o.folio && o.folio === guardado.folio) throw new Error('UQ_shift_tenant_folio');
          turnos.set(guardado.id, guardado);
          return guardado;
        },
      };
      try {
        return await fn(m);
      } catch (e) {
        for (const [k, v] of respaldo) contador.set(k, v);
        for (const k of [...contador.keys()]) if (!respaldo.has(k)) contador.delete(k);
        throw e;
      } finally {
        liberar?.();
      }
    },
  };

  const repo: any = {
    manager,
    create: () => ({}),
    save: async (s: any) => { const g = { ...s, id: s.id ?? `t${++seq}` }; turnos.set(g.id, g); return g; },
    findOne: async ({ where }: any) => { const t = turnos.get(where.id); return t && (!where.tenantId || where.tenantId === t.tenantId) ? { ...t } : null; },
    update: async (id: string, cambios: any) => { turnos.set(id, { ...turnos.get(id), ...cambios }); },
  };
  const ventas: any = { find: async () => [], count: async () => 0 };
  return { servicio: new ShiftsService(repo, ventas), turnos, contador };
}

const datos = (n: number, tenantId = 'tenant-A', extra: any = {}) => ({ cajero: `cajero-${n}`, sucursalId: 's1', tenantId, fondoInicial: 100, ...extra });

describe('formatearFolioTurno', () => {
  it('T-0001 … T-9999 con ceros, y desde 10 000 sin truncar', () => {
    expect(formatearFolioTurno(1)).toBe('T-0001');
    expect(formatearFolioTurno(42)).toBe('T-0042');
    expect(formatearFolioTurno(9999)).toBe('T-9999');
    expect(formatearFolioTurno(10000)).toBe('T-10000');
    expect(formatearFolioTurno(123456)).toBe('T-123456');
  });
});

describe('ShiftsService — horas reales del turno', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: AHORA, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'] });
  });
  afterEach(() => jest.useRealTimers());

  it('abrir 23:45 UTC y cerrar 00:10 UTC: abiertoEn y cerradoEn son instantes ordenados aunque horaCierre (time sin fecha) sea menor que horaApertura', async () => {
    const { servicio, turnos } = crearEntorno();
    const abierto: any = await servicio.openShift(datos(1, 'tenant-A', { clientTimestamp: '2026-10-27T23:45:00.000Z' }));
    expect(abierto.abiertoEn.toISOString()).toBe('2026-10-27T23:45:00.000Z');
    expect(abierto.cerradoEn ?? null).toBeNull();
    turnos.set(abierto.id, { ...turnos.get(abierto.id), precorteGuardado: true, fondoInicial: 100 });

    const cerrado: any = await servicio.closeShift(abierto.id, { efectivoContado: 100, clientTimestamp: '2026-10-28T00:10:00.000Z' }, 'tenant-A');
    expect(cerrado.cerradoEn.toISOString()).toBe('2026-10-28T00:10:00.000Z');
    expect(cerrado.cerradoEn.getTime()).toBeGreaterThan(cerrado.abiertoEn.getTime());
    expect(cerrado.cerradoEn.getTime() - cerrado.abiertoEn.getTime()).toBe(25 * 60 * 1000); // duración real: 25 min
    // lo que causaba el defecto: como `time` sin fecha, el cierre parece anterior a la apertura. Se conserva para compatibilidad.
    // horaApertura/horaCierre salen de toTimeString() (zona del proceso: UTC en producción): siguen guardándose igual que siempre.
    expect(cerrado.horaApertura).toBe(cerrado.abiertoEn.toTimeString().slice(0, 8));
    expect(cerrado.horaCierre).toBe(cerrado.cerradoEn.toTimeString().slice(0, 8));
    if (new Date().getTimezoneOffset() === 0) expect(cerrado.horaCierre < cerrado.horaApertura).toBe(true); // en UTC (producción) el cierre parece anterior
  });

  it('un turno de la tarde en hora de Tijuana (16:45–16:53) cruza la medianoche UTC y aun así dura 8 minutos', async () => {
    const { servicio, turnos } = crearEntorno();
    const abierto: any = await servicio.openShift(datos(1, 'tenant-A', { clientTimestamp: '2026-10-27T23:45:00.000Z' })); // 16:45 en Tijuana (UTC-7)
    turnos.set(abierto.id, { ...turnos.get(abierto.id), precorteGuardado: true });
    const cerrado: any = await servicio.closeShift(abierto.id, { efectivoContado: 100, clientTimestamp: '2026-10-27T23:53:00.000Z' }, 'tenant-A');
    expect(cerrado.cerradoEn.getTime() - cerrado.abiertoEn.getTime()).toBe(8 * 60 * 1000);
    const tijuana = (d: Date) => d.toLocaleTimeString('es-MX', { timeZone: 'America/Tijuana', hour12: false, hour: '2-digit', minute: '2-digit' });
    expect(tijuana(cerrado.abiertoEn)).toBe('16:45');
    expect(tijuana(cerrado.cerradoEn)).toBe('16:53');
  });

  it('sin clientTimestamp usa la hora del servidor', async () => {
    const { servicio } = crearEntorno();
    const abierto: any = await servicio.openShift(datos(1));
    expect(abierto.abiertoEn.toISOString()).toBe(AHORA.toISOString());
  });

  it('la captura retroactiva guarda abiertoEn y cerradoEn (la fecha elegida es de negocio) y también recibe folio', async () => {
    const { servicio } = crearEntorno();
    const r: any = await servicio.createBackfillShift({ cajero: 'admin', sucursalId: 's1', tenantId: 'tenant-A', fecha: '2026-10-20', fondoInicial: 0 } as any);
    expect(r.esRetroactivo).toBe(true);
    expect(r.abiertoEn.toISOString()).toBe(AHORA.toISOString());
    expect(r.cerradoEn.toISOString()).toBe(AHORA.toISOString());
    expect(r.folio).toBe('T-0001');
  });
});

describe('ShiftsService — folio por tenant', () => {
  it('el primer turno de un negocio es T-0001 y los siguientes son consecutivos', async () => {
    const { servicio } = crearEntorno();
    const folios: string[] = [];
    for (let i = 1; i <= 4; i++) folios.push(((await servicio.openShift(datos(i))) as any).folio);
    expect(folios).toEqual(['T-0001', 'T-0002', 'T-0003', 'T-0004']);
  });

  it('altas CONCURRENTES del mismo tenant: folios únicos y consecutivos, sin huecos ni repetidos', async () => {
    const { servicio, turnos, contador } = crearEntorno();
    const N = 25;
    const r = await Promise.all(Array.from({ length: N }, (_, i) => servicio.openShift(datos(i))));
    const folios = r.map((t: any) => t.folio).sort();
    expect(new Set(folios).size).toBe(N);
    expect(folios).toEqual(Array.from({ length: N }, (_, i) => formatearFolioTurno(i + 1)));
    expect(contador.get('tenant-A')).toBe(N);
    expect(turnos.size).toBe(N);
  });

  it('cada tenant lleva su propia cuenta (concurrentes entre negocios no se mezclan)', async () => {
    const { servicio } = crearEntorno();
    const r: any[] = await Promise.all([
      ...Array.from({ length: 6 }, (_, i) => servicio.openShift(datos(i, 'tenant-A'))),
      ...Array.from({ length: 6 }, (_, i) => servicio.openShift(datos(100 + i, 'tenant-B'))),
    ]);
    const de = (t: string) => r.filter((x) => x.tenantId === t).map((x) => x.folio).sort();
    expect(de('tenant-A')).toEqual(['T-0001', 'T-0002', 'T-0003', 'T-0004', 'T-0005', 'T-0006']);
    expect(de('tenant-B')).toEqual(['T-0001', 'T-0002', 'T-0003', 'T-0004', 'T-0005', 'T-0006']);
  });

  it('si el guardado falla, la transacción se revierte y el folio NO se gasta (el siguiente turno no deja hueco)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let fallar = true;
    const { servicio, contador } = crearEntorno({ fallaAlGuardar: () => fallar });
    await expect(servicio.openShift(datos(1))).rejects.toThrow('Error al abrir turno');
    expect(contador.get('tenant-A') ?? 0).toBe(0);
    fallar = false;
    expect(((await servicio.openShift(datos(2))) as any).folio).toBe('T-0001');
  });

  it('un turno sin tenant se guarda sin folio y sin tocar el contador', async () => {
    const { servicio, contador } = crearEntorno();
    const t: any = await servicio.openShift(datos(1, null as any));
    expect(t.folio ?? null).toBeNull();
    expect(contador.size).toBe(0);
  });
});

describe('shift-horas-folio-migration.sql — relleno idempotente de los turnos existentes', () => {
  const sql = readFileSync(join(__dirname, '../../shift-horas-folio-migration.sql'), 'utf8');
  const cuerpo = sql.slice(sql.indexOf('BEGIN;'));

  it('termina en ROLLBACK (se revisa y se cambia a COMMIT a mano)', () => {
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  });
  it('solo agrega: IF NOT EXISTS en columnas, tabla e índice; no borra ni cambia horaApertura, horaCierre ni fecha', () => {
    expect(cuerpo).toMatch(/ADD COLUMN IF NOT EXISTS "abiertoEn" TIMESTAMPTZ/);
    expect(cuerpo).toMatch(/ADD COLUMN IF NOT EXISTS "cerradoEn" TIMESTAMPTZ/);
    expect(cuerpo).toMatch(/ADD COLUMN IF NOT EXISTS "folio"/);
    expect(cuerpo).toMatch(/CREATE TABLE IF NOT EXISTS "shift_folio_contador"/);
    expect(cuerpo).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "UQ_shift_tenant_folio"/);
    expect(cuerpo).not.toMatch(/DROP |DELETE |TRUNCATE /i);
    expect(cuerpo).not.toMatch(/SET\s+"(horaApertura|horaCierre|fecha)"/);
  });
  it('cada UPDATE solo toca filas donde el valor nuevo aún es NULL, así que repetirlo no cambia nada', () => {
    const updates = cuerpo.match(/UPDATE "shift"[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(3);
    expect(updates[0]).toMatch(/WHERE "abiertoEn" IS NULL/);
    expect(updates[1]).toMatch(/WHERE "cerradoEn" IS NULL/);
    expect(cuerpo).toMatch(/WHERE s."folio" IS NULL AND s."tenantId" IS NOT NULL/);
  });
  it('un turno que cruzó la medianoche UTC suma un día al cierre; el contador nunca baja', () => {
    expect(cuerpo).toMatch(/< "abiertoEn" THEN[\s\S]*INTERVAL '1 day'/);
    expect(cuerpo).toMatch(/GREATEST\("shift_folio_contador"\."ultimo", EXCLUDED\."ultimo"\)/);
  });
});
