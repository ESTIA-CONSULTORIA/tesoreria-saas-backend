// Folio corto del turno por negocio: T-0001, T-0002… (a partir de 10 000 crece sin truncar: T-10000).
export const PREFIJO_FOLIO_TURNO = 'T-';

export function formatearFolioTurno(n: number): string {
  const entero = Math.max(0, Math.trunc(n));
  return PREFIJO_FOLIO_TURNO + (entero < 10000 ? String(entero).padStart(4, '0') : String(entero));
}
