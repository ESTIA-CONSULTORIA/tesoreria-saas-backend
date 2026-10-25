import { COLGANTES_POR_SUCURSAL, COLGANTES_PREVIOS, COLGANTE_SUCURSAL, PurgadorSql, SLUG_PRUEBA, TABLAS_GLOBALES, TABLAS_INTOCABLES, clasificarEsquema, esTablaDeRespaldo, ordenarPorFk } from './purgador-sql';
import { MAX_DIAS_PURGA, RETENCION_DIAS } from './prueba-publica.config';

const MS_DIA = 86_400_000;
const AHORA = new Date('2026-12-20T12:00:00Z');
const hace = (d: number) => new Date(AHORA.getTime() - d * MS_DIA);
const TENANT = '11111111-1111-1111-1111-111111111111';

// Esquema ficticio con la misma forma que producción: tablas con tenantId, colgantes por sucursal/empleado/turno, globales e intocables.
const TODAS = ['account', 'area', 'audit_log', 'bank', 'branch', 'company', 'dashboard_metric', 'employee', 'hr_document', 'migrations', 'modules', 'movement', 'permission', 'permission_request_respaldo_20261024', 'plan', 'plan_modules', 'pos_category', 'pos_config', 'pos_message', 'product', 'pruebas_lista_espera', 'pruebas_publicas', 'report', 'role', 'shift', 'stored_file', 'table', 'tenant', 'user'];
const CON_TENANT = ['audit_log', 'bank', 'company', 'employee', 'permission_request_respaldo_20261024', 'product', 'pruebas_publicas', 'shift', 'stored_file', 'table', 'user'];
const ARCOS = [{ hijo: 'product', padre: 'pos_category' }, { hijo: 'table', padre: 'area' }, { hijo: 'permission', padre: 'role' }];

interface Config {
  tenant?: any | null;
  pruebas?: any[];
  empresas?: number;
  tablas?: string[];
  externos?: number;
  filas?: Record<string, number>; // filas que tiene el tenant por tabla
  sobrantes?: Record<string, number>; // tablas que, tras borrar, siguen devolviendo filas (simula un borrado incompleto)
  candado?: boolean;
  borrados?: number; // filas que devuelve el DELETE del tenant
}

function montar(cfg: Config = {}) {
  const sql: Array<{ sql: string; params: any[] }> = [];
  const borradas: string[] = [];
  let rollback = false;
  const tenant = cfg.tenant === undefined ? { id: TENANT, plan: 'PRUEBA', slug: 'prueba-0a1b2c3d4e', activo: false } : cfg.tenant;
  const pruebas = cfg.pruebas ?? [{ estado: 'VENCIDA', venceEn: hace(RETENCION_DIAS + 5), createdAt: hace(70) }];
  const manager = {
    query: jest.fn(async (texto: string, params: any[] = []) => {
      sql.push({ sql: texto, params });
      if (/pg_try_advisory_xact_lock/.test(texto)) return [{ ok: cfg.candado !== false }];
      if (/FROM "tenant" WHERE id::text = \$1 FOR UPDATE/.test(texto)) return tenant ? [tenant] : [];
      if (/FROM "pruebas_publicas" WHERE "tenantId"/.test(texto)) return pruebas;
      if (/count\(\*\)::int AS n FROM "company" WHERE "tenantId"/.test(texto)) return [{ n: borradas.includes('company') ? cfg.sobrantes?.company ?? 0 : cfg.empresas ?? 1 }];
      if (/information_schema\.tables/.test(texto)) return (cfg.tablas ?? TODAS).map((t) => ({ t }));
      if (/information_schema\.columns/.test(texto)) return CON_TENANT.map((t) => ({ t }));
      if (/provider <> 'base64_postgres'/.test(texto)) return [{ n: cfg.externos ?? 0 }];
      if (/conrelid = con\.confrelid/.test(texto)) return [];
      if (/AS hijo/.test(texto)) return ARCOS;
      let m = /WITH d AS \(DELETE FROM "tenant"/.exec(texto);
      if (m) { borradas.push('tenant'); return [{ n: cfg.borrados ?? 1 }]; }
      m = /WITH d AS \(DELETE FROM "(\w+)" WHERE/.exec(texto);
      if (m) { borradas.push(m[1]); return [{ n: cfg.filas?.[m[1]] ?? 0 }]; }
      m = /SELECT count\(\*\)::int AS n FROM "(\w+)"/.exec(texto);
      if (m) return [{ n: cfg.sobrantes?.[m[1]] ?? 0 }];
      if (/^UPDATE/.test(texto)) return [];
      throw new Error('consulta no prevista en el doble: ' + texto.slice(0, 80));
    }),
  };
  const ds = { transaction: jest.fn(async (cb: any) => { try { return await cb(manager); } catch (e) { rollback = true; throw e; } }) };
  return { purgador: new PurgadorSql(ds as any), sql, borradas, manager, rollbackHecho: () => rollback };
}

describe('purgador SQL — piezas puras', () => {
  it('ordenarPorFk: los hijos se borran antes que sus padres; ignora autorreferencias y arcos hacia tablas fuera del conjunto', () => {
    const o = ordenarPorFk(['insumo', 'recipe', 'recipe_item', 'supplier', 'purchase'], [
      { hijo: 'recipe_item', padre: 'recipe' }, { hijo: 'recipe_item', padre: 'insumo' }, { hijo: 'purchase', padre: 'supplier' },
      { hijo: 'insumo', padre: 'insumo' }, { hijo: 'insumo', padre: 'familia_insumo' },
    ]);
    expect(o.indexOf('recipe_item')).toBeLessThan(o.indexOf('recipe'));
    expect(o.indexOf('recipe_item')).toBeLessThan(o.indexOf('insumo'));
    expect(o.indexOf('purchase')).toBeLessThan(o.indexOf('supplier'));
    expect([...o].sort()).toEqual(['insumo', 'purchase', 'recipe', 'recipe_item', 'supplier']);
  });

  it('ordenarPorFk: un ciclo de llaves foráneas es un error (no adivina el orden)', () => {
    expect(() => ordenarPorFk(['a', 'b'], [{ hijo: 'a', padre: 'b' }, { hijo: 'b', padre: 'a' }])).toThrow(/Ciclo/);
  });

  it('clasificarEsquema: una tabla nueva sin tenantId y sin clasificar se reporta; respaldos, intocables, globales y colgantes no se borran por tenantId', () => {
    const r = clasificarEsquema(TODAS, new Set(CON_TENANT));
    expect(r.sinClasificar).toEqual([]);
    expect(r.aBorrar.sort()).toEqual(['audit_log', 'bank', 'employee', 'product', 'shift', 'stored_file', 'table', 'user']);
    for (const t of ['pruebas_publicas', 'pruebas_lista_espera', 'company', 'tenant', 'permission_request_respaldo_20261024', 'plan']) expect(r.aBorrar).not.toContain(t);
    expect(clasificarEsquema([...TODAS, 'tabla_nueva_sin_clasificar'], new Set(CON_TENANT)).sinClasificar).toEqual(['tabla_nueva_sin_clasificar']);
    // una tabla nueva CON tenantId sí se cubre sola
    expect(clasificarEsquema([...TODAS, 'cosa_nueva'], new Set([...CON_TENANT, 'cosa_nueva'])).aBorrar).toContain('cosa_nueva');
  });

  it('lo intocable: pruebas_publicas (aceptación del aviso), lista de espera, bitácora, respaldos y catálogos globales', () => {
    for (const t of ['pruebas_publicas', 'pruebas_lista_espera', 'pruebas_eventos', 'tenant']) expect(TABLAS_INTOCABLES.has(t)).toBe(true);
    for (const t of ['bak_prueba_20261013_product', 'vacation_request_respaldo_20261024']) expect(esTablaDeRespaldo(t)).toBe(true);
    expect(esTablaDeRespaldo('product')).toBe(false);
    for (const t of ['role', 'permission', 'plan', 'plan_modules', 'modules']) expect(TABLAS_GLOBALES.has(t)).toBe(true);
    // ninguna tabla colgante coincide con una intocable ni con una global
    for (const c of [...COLGANTES_PREVIOS, ...COLGANTES_POR_SUCURSAL, COLGANTE_SUCURSAL]) {
      expect(TABLAS_INTOCABLES.has(c.tabla)).toBe(false);
      expect(TABLAS_GLOBALES.has(c.tabla)).toBe(false);
      expect(c.donde).toContain('$1'); // toda condición cuelga del tenant recibido
    }
  });

  it('el slug de prueba solo lo cumple el generado por la prueba pública', () => {
    expect(SLUG_PRUEBA.test('prueba-0a1b2c3d4e')).toBe(true);
    for (const malo of ['bocatta', 'riova-dental', 'prueba-xyz', 'prueba-0a1b2c3d4e5', 'mi-prueba-0a1b2c3d4e', '', 'prueba-0A1B2C3D4E']) expect(SLUG_PRUEBA.test(malo)).toBe(false);
  });

  it(`compromiso del aviso de privacidad: la retención (${RETENCION_DIAS}) deja margen de sobra bajo los ${MAX_DIAS_PURGA} días`, () => {
    expect(MAX_DIAS_PURGA).toBe(90);
    expect(RETENCION_DIAS + 31).toBeLessThanOrEqual(MAX_DIAS_PURGA); // la purga corre a diario: ≥ 31 días de margen para reintentos
  });
});

describe('purgador SQL — seguros (nunca toca lo que no es una prueba vencida)', () => {
  const rechaza = async (cfg: Config, mensaje: RegExp) => {
    const m = montar(cfg);
    await expect(m.purgador.purgarTenant(TENANT, AHORA)).rejects.toThrow(mensaje);
    expect(m.borradas).toEqual([]); // ni una sola sentencia de borrado
    expect(m.rollbackHecho()).toBe(true);
  };

  it('tenant inexistente', () => rechaza({ tenant: null }, /no existe/));
  it.each(['BUSINESS', 'PRO', 'BASIC', 'ENTERPRISE', 'LITE_POS', 'prueba'])('plan %s (convertido o de cliente): no se purga', (plan) =>
    rechaza({ tenant: { id: TENANT, plan, slug: 'prueba-0a1b2c3d4e', activo: false } }, /plan PRUEBA/));
  it.each(['bocatta', 'riova-dental', 'demo', '', null])('slug %p que no es de la prueba pública: no se purga aunque el plan sea PRUEBA', (slug) =>
    rechaza({ tenant: { id: TENANT, plan: 'PRUEBA', slug, activo: false } }, /no fue creado por la prueba pública/));
  it('sin solicitud de prueba pública: no se purga', () => rechaza({ pruebas: [] }, /no tiene solicitud/));
  it.each(['ACTIVA', 'SOLICITADA', 'CONVERTIDA'])('una solicitud %s del mismo negocio bloquea la purga aunque haya otra VENCIDA', (estado) =>
    rechaza({ pruebas: [{ estado: 'VENCIDA', venceEn: hace(100), createdAt: hace(130) }, { estado, venceEn: hace(100), createdAt: hace(130) }] }, /activa, pendiente o convertida/));
  it('VENCIDA dentro de la retención: no se purga', () => rechaza({ pruebas: [{ estado: 'VENCIDA', venceEn: hace(RETENCION_DIAS - 1), createdAt: hace(90) }] }, /retención/));
  it('VENCIDA sin fecha: no se purga', () => rechaza({ pruebas: [{ estado: 'VENCIDA', venceEn: null, createdAt: hace(90) }] }, /retención/));
  it('PURGADA: no es candidata', () => rechaza({ pruebas: [{ estado: 'PURGADA', venceEn: hace(100), createdAt: hace(130) }] }, /retención|vencido/));
  it('FALLIDA con el tenant ACTIVO: no se purga', () =>
    rechaza({ tenant: { id: TENANT, plan: 'PRUEBA', slug: 'prueba-0a1b2c3d4e', activo: true }, pruebas: [{ estado: 'FALLIDA', venceEn: null, createdAt: hace(60) }] }, /retención|vencido/));
  it('más de una empresa: no parece una prueba', () => rechaza({ empresas: 2 }, /más de una empresa/));
  it('otra purga del mismo negocio en curso (candado)', () => rechaza({ candado: false }, /en curso/));
  it('una tabla nueva sin clasificar ABORTA la purga en vez de dejar datos atrás', () => rechaza({ tablas: [...TODAS, 'tabla_nueva'] }, /sin clasificar.*tabla_nueva/));
  it('archivos en almacenamiento externo: no se purga', () => rechaza({ externos: 1 }, /almacenamiento externo/));
});

describe('purgador SQL — el borrado', () => {
  it('VENCIDA pasada la retención con plan PRUEBA y slug de prueba: borra en orden, deja la aceptación del aviso y devuelve solo conteos', async () => {
    const m = montar({ filas: { user: 2, shift: 1, bank: 1, movement: 3, company: 1, branch: 1 } });
    const r = await m.purgador.purgarTenant(TENANT, AHORA);
    expect(r.tablas).toMatchObject({ user: 2, shift: 1, bank: 1, movement: 3, company: 1, branch: 1, tenant: 1 });
    expect(r.filas).toBe(2 + 1 + 1 + 3 + 1 + 1 + 1);
    expect(JSON.stringify(r)).not.toMatch(/@|prueba-0a1b/); // bitácora sin datos personales ni slug
    // pruebas_publicas / lista de espera / respaldos / globales: jamás aparecen en un DELETE
    for (const t of ['pruebas_publicas', 'pruebas_lista_espera', 'permission_request_respaldo_20261024', 'role', 'permission', 'plan', 'plan_modules', 'modules', 'migrations']) expect(m.borradas).not.toContain(t);
    expect(m.sql.some((s) => /DELETE FROM "pruebas_publicas"|UPDATE "pruebas_publicas"/.test(s.sql))).toBe(false);
  });

  it('todo DELETE/UPDATE va acotado al tenant recibido: parámetro $1 = ese tenant y cláusula WHERE', async () => {
    const m = montar();
    await m.purgador.purgarTenant(TENANT, AHORA);
    const escrituras = m.sql.filter((s) => /DELETE FROM|^UPDATE/.test(s.sql));
    expect(escrituras.length).toBeGreaterThan(10);
    for (const e of escrituras) {
      expect(e.sql).toMatch(/WHERE/);
      expect(e.sql).toContain('$1');
      expect(e.params[0]).toBe(TENANT);
    }
    // el único DELETE sin tabla de tenantId es el del propio tenant, y exige además el plan PRUEBA
    const delTenant = escrituras.find((e) => /DELETE FROM "tenant"/.test(e.sql))!;
    expect(delTenant.sql).toContain('plan = $2');
    expect(delTenant.params).toEqual([TENANT, 'PRUEBA']);
  });

  it('orden: lo que consulta la condición de otros (banco, empleado, turno, usuario, empresa) se borra DESPUÉS; el tenant al final; hijos por FK antes que padres', async () => {
    const m = montar();
    await m.purgador.purgarTenant(TENANT, AHORA);
    const i = (t: string) => m.borradas.indexOf(t);
    expect(i('movement')).toBeLessThan(i('bank'));
    expect(i('hr_document')).toBeLessThan(i('employee'));
    expect(i('pos_message')).toBeLessThan(i('shift'));
    expect(i('pos_message')).toBeLessThan(i('user'));
    for (const hijo of ['product', 'table']) { expect(i(hijo)).toBeLessThan(i('pos_category')); expect(i(hijo)).toBeLessThan(i('area')); }
    expect(i('account')).toBeLessThan(i('branch'));
    expect(i('branch')).toBeLessThan(i('company'));
    expect(i('company')).toBe(m.borradas.length - 2);
    expect(m.borradas[m.borradas.length - 1]).toBe('tenant');
  });

  it('FALLIDA con el tenant desactivado y pasada la retención: sí se purga (el alta a medias deja un tenant inutilizable)', async () => {
    const m = montar({ pruebas: [{ estado: 'FALLIDA', venceEn: null, createdAt: hace(RETENCION_DIAS + 1) }] });
    await expect(m.purgador.purgarTenant(TENANT, AHORA)).resolves.toBeDefined();
    expect(m.borradas[m.borradas.length - 1]).toBe('tenant');
  });

  it('si una tabla conserva filas del negocio tras el borrado: rollback de TODO y error', async () => {
    const m = montar({ sobrantes: { shift: 1 } });
    await expect(m.purgador.purgarTenant(TENANT, AHORA)).rejects.toThrow(/aún quedan 1 filas/);
    expect(m.rollbackHecho()).toBe(true);
  });

  it('si el DELETE del tenant no afecta exactamente una fila: rollback', async () => {
    const m = montar({ borrados: 0 });
    await expect(m.purgador.purgarTenant(TENANT, AHORA)).rejects.toThrow(/exactamente un tenant/);
    expect(m.rollbackHecho()).toBe(true);
  });

  it('exige un tenantId', async () => {
    const m = montar();
    await expect(m.purgador.purgarTenant('' as any, AHORA)).rejects.toThrow(/tenantId/);
    expect(m.manager.query).not.toHaveBeenCalled();
  });
});
