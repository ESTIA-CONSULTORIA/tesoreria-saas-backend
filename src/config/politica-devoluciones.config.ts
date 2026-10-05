// Política de devoluciones del POS, configurable por tenant (la edita su ADMIN).
//  - SOLO_GERENTE (default): solo un ADMIN o GERENTE puede devolver una venta ya cobrada.
//  - CAJERO_LIBRE: cualquier usuario autenticado con el módulo POS puede devolver.
// Vive en TenantSetting.posCapabilities (JSON existente, sin migración) bajo la clave
// 'politicaDevoluciones'; una fila sin la clave —todas las existentes y las nuevas— cae a este
// default, igual que hasPosCapability() con DEFAULT_POS_CAPABILITIES: no hace falta backfill.
export const POLITICAS_DEVOLUCION = ['SOLO_GERENTE', 'CAJERO_LIBRE'] as const;

export type PoliticaDevolucion = typeof POLITICAS_DEVOLUCION[number];

export const DEFAULT_POLITICA_DEVOLUCION: PoliticaDevolucion = 'SOLO_GERENTE';

export const POLITICA_DEVOLUCION_KEY = 'politicaDevoluciones';

// Mismos roleCode que ya usa movements.controller para aprobar/rechazar: ['ADMIN', 'GERENTE'].
export const ROLES_GERENTE = ['ADMIN', 'GERENTE'];

export function isValidPoliticaDevolucion(value: unknown): value is PoliticaDevolucion {
  return typeof value === 'string' && (POLITICAS_DEVOLUCION as readonly string[]).includes(value);
}
