import { DEFAULT_POLITICA_DEVOLUCION, POLITICAS_DEVOLUCION } from './politica-devoluciones.config';
import { ROLES_CAJA } from './roles-pos.config';

// Políticas del POS configurables por tenant (las cambia su ADMIN). Mismo patrón que politicaDevoluciones: viven
// en el JSON TenantSetting.posCapabilities (sin migración), una fila sin la clave —todas las existentes y las
// nuevas— cae al default (sin backfill), valor inválido = 400, y se leen en el servidor, nunca del cliente.
//
//  · politicaCobro (quién cobra una cuenta de mesa y desde dónde)
//      SOLO_CAJA (default)  → solo desde caja. Desde mesa, nadie.
//      GERENTE_EN_MESA      → además, en mesa: GERENTE, CAPITAN y ADMIN.
//      MESERO_EN_MESA       → además, en mesa: MESERO.
//  · politicaDivisionCuentas (quién puede DIVIDIR el cobro: parcial, por persona o por ítems)
//      GERENTE_CAPITAN_CAJERO (default), SOLO_GERENTE, TODOS. ADMIN siempre puede.
//      Cobrar la cuenta completa de una vez no es dividir.
export const POLITICAS_COBRO = ['SOLO_CAJA', 'GERENTE_EN_MESA', 'MESERO_EN_MESA'] as const;
export const POLITICAS_DIVISION = ['GERENTE_CAPITAN_CAJERO', 'SOLO_GERENTE', 'TODOS'] as const;

export type PoliticaCobro = typeof POLITICAS_COBRO[number];
export type PoliticaDivision = typeof POLITICAS_DIVISION[number];

export const POLITICAS_POS = {
  politicaDevoluciones: { valores: POLITICAS_DEVOLUCION as readonly string[], default: DEFAULT_POLITICA_DEVOLUCION as string },
  politicaCobro: { valores: POLITICAS_COBRO as readonly string[], default: 'SOLO_CAJA' as string },
  politicaDivisionCuentas: { valores: POLITICAS_DIVISION as readonly string[], default: 'GERENTE_CAPITAN_CAJERO' as string },
} as const;

export type PoliticaKey = keyof typeof POLITICAS_POS;
export const POLITICA_KEYS = Object.keys(POLITICAS_POS) as PoliticaKey[];

export function isValidPoliticaValor(key: PoliticaKey, value: unknown): value is string {
  return typeof value === 'string' && POLITICAS_POS[key].valores.includes(value);
}

// ── Reglas de rol para cuentas de mesa ───────────────────────────────────────────────────────────────────────
// Quien ejecuta (req.user del JWT). posLiteAccess = sesión POS Lite (NIP).
export type ActorMesas = { id?: string; email?: string; roleCode?: string; posLiteAccess?: boolean };

export type ContextoCobro = 'CAJA' | 'MESA';

// "Caja": sesión ERP con rol ADMIN, GERENTE o CAJERO. Todo lo demás es "mesa": sesión POS Lite, o sesión ERP
// con MESERO o CAPITAN (un mesero con sesión ERP no se salta la política). Un gerente con sesión ERP en una
// tableta cuenta como caja, y es correcto: ya puede cobrar ahí.
export function contextoCobro(actor?: ActorMesas): ContextoCobro {
  return !actor?.posLiteAccess && ROLES_CAJA.includes(actor?.roleCode ?? '') ? 'CAJA' : 'MESA';
}

const ROLES_COBRAN_EN_MESA: Record<PoliticaCobro, string[]> = {
  SOLO_CAJA: [],
  GERENTE_EN_MESA: ['GERENTE', 'CAPITAN', 'ADMIN'],
  MESERO_EN_MESA: ['GERENTE', 'CAPITAN', 'ADMIN', 'MESERO'],
};

// Cobro completo (una sola vez): desde caja siempre; desde mesa según politicaCobro.
export function puedeCobrar(actor: ActorMesas | undefined, politicaCobro: PoliticaCobro): boolean {
  if (contextoCobro(actor) === 'CAJA') return true;
  return ROLES_COBRAN_EN_MESA[politicaCobro].includes(actor?.roleCode ?? '');
}

const ROLES_DIVIDEN: Record<PoliticaDivision, string[] | 'TODOS'> = {
  GERENTE_CAPITAN_CAJERO: ['GERENTE', 'CAPITAN', 'CAJERO'],
  SOLO_GERENTE: ['GERENTE'],
  TODOS: 'TODOS',
};

// Cobro dividido: debe poder cobrar (política de cobro) Y estar permitido por politicaDivisionCuentas. ADMIN siempre.
export function puedeDividir(actor: ActorMesas | undefined, politicaCobro: PoliticaCobro, politicaDivision: PoliticaDivision): boolean {
  if (!puedeCobrar(actor, politicaCobro)) return false;
  if (actor?.roleCode === 'ADMIN') return true;
  const permitidos = ROLES_DIVIDEN[politicaDivision];
  return permitidos === 'TODOS' || permitidos.includes(actor?.roleCode ?? '');
}
