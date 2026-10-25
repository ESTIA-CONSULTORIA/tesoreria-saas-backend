import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PLAN_PRUEBA, RETENCION_DIAS } from './prueba-publica.config';
import type { ResultadoPurgaTenant, TenantPurger } from './puertos';

// Purga FÍSICA de un negocio de prueba (PP3). Es lo único del sistema que borra todos los datos de un tenant, así que está construido para NO poder
// alcanzar a un cliente: cada paso es un seguro independiente y TODO ocurre en UNA transacción por tenant (si cualquier cosa falla, no se borra nada).
//
//  1. Candado asesor por tenant (dos instancias no purgan el mismo a la vez).
//  2. El tenant debe existir, tener plan PRUEBA y un slug generado por la prueba pública (`prueba-` + 10 hex); un cliente real nunca cumple los tres.
//  3. Su fila en pruebas_publicas debe estar VENCIDA (pasada la retención) o FALLIDA con el tenant desactivado (pasada la retención), y NINGUNA fila
//     suya puede estar ACTIVA, SOLICITADA o CONVERTIDA.
//  4. Un negocio de prueba tiene a lo más una empresa; más es señal de que no es una prueba y se rechaza.
//  5. Todas las tablas del esquema deben estar clasificadas (con tenantId, colgantes por empresa/sucursal/etc., globales o intocables): una tabla nueva
//     sin clasificar ABORTA la purga en vez de dejar datos atrás (y se ve en el log).
//  6. Solo se borra con `WHERE … = $1` (el tenant); tras borrar se comprueba que no queda NADA del tenant. Si queda algo, rollback.
//
// NUNCA se borra: pruebas_publicas (guarda la aceptación del aviso de privacidad: fecha, versión y URL), pruebas_lista_espera, pruebas_eventos,
// las tablas de respaldo (`bak_*`, `*_respaldo_*`) ni catálogos globales.

/** Tablas que la purga jamás toca aunque tengan `tenantId`. */
export const TABLAS_INTOCABLES: ReadonlySet<string> = new Set(['pruebas_publicas', 'pruebas_lista_espera', 'pruebas_eventos', 'tenant', 'migrations']);
export const esTablaDeRespaldo = (t: string): boolean => /(^bak_|respaldo)/i.test(t);

/** Catálogos y tablas del sistema sin datos de ningún negocio. */
export const TABLAS_GLOBALES: ReadonlySet<string> = new Set(['business_type', 'dashboard_metric', 'report', 'role', 'permission', 'plan', 'plan_modules', 'modules']);

const ES_IDENTIFICADOR = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SLUG_PRUEBA = /^prueba-[0-9a-f]{10}$/;

// Subconsultas del tenant ($1 = tenantId). Los ids se comparan como texto: unas columnas son uuid y otras varchar.
const EMPRESAS = `SELECT id::text FROM "company" WHERE "tenantId" = $1`;
const SUCURSALES = `SELECT id::text FROM "branch" WHERE "companyId"::text IN (${EMPRESAS})`;

/** Tablas SIN tenantId que cuelgan del negocio por referencias blandas (sin FK). Cada una dice qué filas son del tenant. */
export interface Colgante { tabla: string; donde: string }

/** Fase 1: se borran ANTES que las tablas con tenantId porque su condición las consulta (bancos, empleados, turnos, usuarios). */
export const COLGANTES_PREVIOS: readonly Colgante[] = [
  { tabla: 'movement', donde: `"accountId"::text IN (SELECT id::text FROM "bank" WHERE "tenantId" = $1) OR "accountId"::text IN (SELECT id::text FROM "account" WHERE "branchId"::text IN (${SUCURSALES}))` },
  { tabla: 'hr_document', donde: `"employeeId"::text IN (SELECT id::text FROM "employee" WHERE "tenantId" = $1)` },
  { tabla: 'pos_message', donde: `"turnoId"::text IN (SELECT id::text FROM "shift" WHERE "tenantId" = $1) OR "userId"::text IN (SELECT id::text FROM "user" WHERE "tenantId" = $1)` },
];

/** Fase 3: después de las tablas con tenantId (producto y mesa los referencian por FK) y antes de borrar sucursal/empresa. */
export const COLGANTES_POR_SUCURSAL: readonly Colgante[] = ['account', 'area', 'pos_category', 'pos_config'].map((tabla) => ({ tabla, donde: `"branchId"::text IN (${SUCURSALES})` }));

/** Fase 4: sucursales y, aparte, la empresa (`company` sí tiene tenantId pero debe vivir hasta aquí porque las condiciones de arriba la consultan). */
export const COLGANTE_SUCURSAL: Colgante = { tabla: 'branch', donde: `"companyId"::text IN (${EMPRESAS})` };

const COLGANTES_CONOCIDOS: ReadonlySet<string> = new Set([...COLGANTES_PREVIOS, ...COLGANTES_POR_SUCURSAL, COLGANTE_SUCURSAL].map((c) => c.tabla));

export interface ArcoFk { hijo: string; padre: string }

/** Orden de borrado: los hijos antes que sus padres (FK). Ignora autorreferencias (se anulan aparte) y falla ante un ciclo en vez de adivinar. */
export function ordenarPorFk(tablas: readonly string[], arcos: readonly ArcoFk[]): string[] {
  const en = new Set(tablas);
  const hijosDe = new Map<string, Set<string>>(tablas.map((t) => [t, new Set<string>()]));
  const pendientes = new Map<string, number>(tablas.map((t) => [t, 0])); // cuántos hijos aún sin borrar tiene cada tabla
  for (const a of arcos) {
    if (a.hijo === a.padre || !en.has(a.hijo) || !en.has(a.padre)) continue;
    if (hijosDe.get(a.padre)!.has(a.hijo)) continue;
    hijosDe.get(a.padre)!.add(a.hijo);
    pendientes.set(a.padre, (pendientes.get(a.padre) ?? 0) + 1);
  }
  const padresDe = new Map<string, string[]>(tablas.map((t) => [t, []]));
  for (const [padre, hijos] of hijosDe) for (const h of hijos) padresDe.get(h)!.push(padre);
  const salida: string[] = [];
  const cola = [...tablas].filter((t) => (pendientes.get(t) ?? 0) === 0).sort();
  while (cola.length) {
    const t = cola.shift()!;
    salida.push(t);
    for (const p of padresDe.get(t) ?? []) {
      pendientes.set(p, (pendientes.get(p) ?? 0) - 1);
      if (pendientes.get(p) === 0) { cola.push(p); cola.sort(); }
    }
  }
  if (salida.length !== tablas.length) throw new Error('Ciclo de llaves foráneas entre las tablas del negocio: la purga no puede ordenar el borrado.');
  return salida;
}

/** Clasifica el esquema. Devuelve las tablas con tenantId a borrar y las que no se pudieron clasificar (la purga aborta si hay alguna). */
export function clasificarEsquema(tablas: readonly string[], conTenantId: ReadonlySet<string>): { aBorrar: string[]; sinClasificar: string[] } {
  const aBorrar: string[] = [];
  const sinClasificar: string[] = [];
  for (const t of tablas) {
    if (TABLAS_INTOCABLES.has(t) || esTablaDeRespaldo(t) || TABLAS_GLOBALES.has(t) || COLGANTES_CONOCIDOS.has(t)) continue;
    if (conTenantId.has(t)) { if (t !== 'company') aBorrar.push(t); continue; }
    sinClasificar.push(t);
  }
  return { aBorrar, sinClasificar };
}

const q = (t: string): string => {
  if (!ES_IDENTIFICADOR.test(t)) throw new Error(`Identificador no válido: ${t}`);
  return `"${t}"`;
};

type Manager = { query: (sql: string, params?: any[]) => Promise<any> };

@Injectable()
export class PurgadorSql implements TenantPurger {
  private readonly log = new Logger('PurgaPrueba');
  constructor(@InjectDataSource() private ds: DataSource) {}

  async purgarTenant(tenantId: string, ahora = new Date()): Promise<ResultadoPurgaTenant> {
    if (!tenantId || typeof tenantId !== 'string') throw new Error('purgarTenant exige un tenantId.');
    const resultado = await this.ds.transaction((m) => this.ejecutar(m as unknown as Manager, tenantId, ahora));
    // Bitácora SIN datos personales: solo ids y conteos.
    this.log.log(`Purgado el negocio de prueba ${tenantId}: ${resultado.filas} filas en ${Object.keys(resultado.tablas).length} tablas.`);
    return resultado;
  }

  private async contar(m: Manager, sql: string, params: any[]): Promise<number> {
    const r = await m.query(sql, params);
    return Number(r?.[0]?.n ?? 0);
  }

  private async borrar(m: Manager, tabla: string, donde: string, tenantId: string, tablas: Record<string, number>): Promise<void> {
    const n = await this.contar(m, `WITH d AS (DELETE FROM ${q(tabla)} WHERE ${donde} RETURNING 1) SELECT count(*)::int AS n FROM d`, [tenantId]);
    tablas[tabla] = (tablas[tabla] ?? 0) + n;
    const quedan = await this.contar(m, `SELECT count(*)::int AS n FROM ${q(tabla)} WHERE ${donde}`, [tenantId]);
    if (quedan !== 0) throw new Error(`Tras borrar ${tabla} aún quedan ${quedan} filas del negocio.`);
  }

  private async ejecutar(m: Manager, tenantId: string, ahora: Date): Promise<ResultadoPurgaTenant> {
    // 1. candado por tenant
    const candado = await m.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [`purga:${tenantId}`]);
    if (candado?.[0]?.ok !== true) throw new Error('Otra purga de este negocio está en curso.');

    // 2. el tenant: existe, plan PRUEBA y slug de prueba pública
    const t = (await m.query(`SELECT id::text AS id, plan, slug, "isActive" AS activo FROM "tenant" WHERE id::text = $1 FOR UPDATE`, [tenantId]))?.[0];
    if (!t) throw new Error('El negocio no existe.');
    if (t.plan !== PLAN_PRUEBA) throw new Error('El negocio no tiene plan PRUEBA: no se purga.');
    if (!SLUG_PRUEBA.test(String(t.slug ?? ''))) throw new Error('El negocio no fue creado por la prueba pública: no se purga.');

    // 3. sus solicitudes: ninguna viva ni convertida, y al menos una vencida/fallida pasada la retención
    const filas: Array<{ estado: string; venceEn: Date | null; createdAt: Date }> = await m.query(
      `SELECT estado, "venceEn", "createdAt" FROM "pruebas_publicas" WHERE "tenantId" = $1`, [tenantId]);
    if (!filas.length) throw new Error('El negocio no tiene solicitud de prueba pública: no se purga.');
    if (filas.some((f) => ['ACTIVA', 'SOLICITADA', 'CONVERTIDA'].includes(f.estado))) throw new Error('El negocio tiene una prueba activa, pendiente o convertida: no se purga.');
    const limite = ahora.getTime() - RETENCION_DIAS * 86_400_000;
    const elegible = filas.some((f) =>
      (f.estado === 'VENCIDA' && !!f.venceEn && new Date(f.venceEn).getTime() <= limite) ||
      (f.estado === 'FALLIDA' && t.activo === false && new Date(f.createdAt).getTime() <= limite));
    if (!elegible) throw new Error('El negocio aún no cumple la retención o no está vencido/fallido: no se purga.');

    // 4. una prueba tiene a lo más una empresa
    if ((await this.contar(m, `SELECT count(*)::int AS n FROM "company" WHERE "tenantId" = $1`, [tenantId])) > 1) throw new Error('El negocio tiene más de una empresa: no parece una prueba, no se purga.');

    // 5. clasificación del esquema
    const todas: string[] = (await m.query(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).map((r: any) => r.t);
    const conTenant = new Set<string>((await m.query(`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`)).map((r: any) => r.t));
    const { aBorrar, sinClasificar } = clasificarEsquema(todas, conTenant);
    if (sinClasificar.length) throw new Error(`Tablas sin clasificar para la purga (agrégalas a purgador-sql.ts): ${sinClasificar.join(', ')}`);
    // los externos: un archivo fuera de Postgres no se puede verificar desde aquí
    if (conTenant.has('stored_file')) {
      const externos = await this.contar(m, `SELECT count(*)::int AS n FROM "stored_file" WHERE "tenantId" = $1 AND provider <> 'base64_postgres'`, [tenantId]);
      if (externos > 0) throw new Error('El negocio tiene archivos en un almacenamiento externo: bórralos primero, la purga no los alcanza.');
    }

    const arcos: ArcoFk[] = (await m.query(
      `SELECT cl.relname AS hijo, pl.relname AS padre FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class pl ON pl.oid = con.confrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE con.contype = 'f' AND n.nspname = 'public'`)) as ArcoFk[];
    const orden = ordenarPorFk(aBorrar, arcos);
    const tablas: Record<string, number> = {};

    // 6. borrado por fases
    for (const c of COLGANTES_PREVIOS) await this.borrar(m, c.tabla, c.donde, tenantId, tablas);
    // autorreferencias (p. ej. insumo.reemplazadoPorId): se anulan para que el borrado no dependa del orden de las filas
    const auto: Array<{ tabla: string; col: string }> = await m.query(
      `SELECT cl.relname AS tabla, a.attname AS col FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey) WHERE con.contype = 'f' AND con.conrelid = con.confrelid AND n.nspname = 'public'`);
    for (const a of auto) if (aBorrar.includes(a.tabla)) await m.query(`UPDATE ${q(a.tabla)} SET ${q(a.col)} = NULL WHERE "tenantId" = $1`, [tenantId]);
    for (const tabla of orden) await this.borrar(m, tabla, `"tenantId" = $1`, tenantId, tablas);
    for (const c of COLGANTES_POR_SUCURSAL) await this.borrar(m, c.tabla, c.donde, tenantId, tablas);
    await this.borrar(m, COLGANTE_SUCURSAL.tabla, COLGANTE_SUCURSAL.donde, tenantId, tablas);
    await this.borrar(m, 'company', `"tenantId" = $1`, tenantId, tablas);

    // 7. el tenant, con el mismo seguro de plan
    const n = await this.contar(m, `WITH d AS (DELETE FROM "tenant" WHERE id::text = $1 AND plan = $2 RETURNING 1) SELECT count(*)::int AS n FROM d`, [tenantId, PLAN_PRUEBA]);
    if (n !== 1) throw new Error('No se pudo borrar exactamente un tenant: rollback.');
    tablas.tenant = 1;

    // 8. comprobación final: nada del tenant en ninguna tabla con tenantId (salvo las intocables)
    for (const tabla of conTenant) {
      if (TABLAS_INTOCABLES.has(tabla) || esTablaDeRespaldo(tabla)) continue;
      const quedan = await this.contar(m, `SELECT count(*)::int AS n FROM ${q(tabla)} WHERE "tenantId" = $1`, [tenantId]);
      if (quedan !== 0) throw new Error(`Comprobación final: ${tabla} conserva ${quedan} filas del negocio.`);
    }
    return { tablas, filas: Object.values(tablas).reduce((s, x) => s + x, 0) };
  }
}
