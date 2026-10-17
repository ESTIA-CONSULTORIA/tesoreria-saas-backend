import { RFC_GENERICO_EXTRANJERO, RFC_GENERICO_NACIONAL } from './sat-catalogos';

// Validación local (sin PAC): formato, fecha y dígito verificador del RFC; CP de 5 dígitos; claves por formato.
// La validación contra la lista de contribuyentes del SAT (RFC + nombre + CP + régimen) requiere el PAC y NO se hace aquí.

const ALFABETO = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';
const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2})([A\d])$/;

function fechaValida(aa: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1) return false;
  // El año de 2 dígitos es ambiguo: se acepta si la fecha existe en cualquiera de los dos siglos (29-feb solo en bisiesto).
  const diasMes = (anio: number) => new Date(anio, mm, 0).getDate();
  return dd <= Math.max(diasMes(1900 + aa), diasMes(2000 + aa));
}

export function digitoVerificadorRfc(rfcSinDigito: string): string {
  const base = rfcSinDigito.length === 11 ? ` ${rfcSinDigito}` : rfcSinDigito; // persona moral: 12 posiciones
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const idx = ALFABETO.indexOf(base[i]);
    if (idx < 0) return '?';
    suma += idx * (13 - i);
  }
  const resto = suma % 11;
  if (resto === 0) return '0';
  const dv = 11 - resto;
  return dv === 10 ? 'A' : String(dv);
}

export type TipoRfc = 'MORAL' | 'FISICA' | 'GENERICO_NACIONAL' | 'GENERICO_EXTRANJERO';

export function validarRfc(valor: string | null | undefined): { ok: true; rfc: string; tipo: TipoRfc } | { ok: false; motivo: string } {
  const rfc = String(valor ?? '').trim().toUpperCase();
  if (rfc === RFC_GENERICO_NACIONAL) return { ok: true, rfc, tipo: 'GENERICO_NACIONAL' };
  if (rfc === RFC_GENERICO_EXTRANJERO) return { ok: true, rfc, tipo: 'GENERICO_EXTRANJERO' };
  const m = RFC_RE.exec(rfc);
  if (!m) return { ok: false, motivo: 'RFC con formato inválido (12 caracteres para persona moral, 13 para persona física).' };
  if (!fechaValida(Number(m[2]), Number(m[3]), Number(m[4]))) return { ok: false, motivo: 'La fecha dentro del RFC no es válida.' };
  if (digitoVerificadorRfc(rfc.slice(0, -1)) !== rfc.slice(-1)) return { ok: false, motivo: 'El dígito verificador del RFC no coincide.' };
  return { ok: true, rfc, tipo: m[1].length === 3 ? 'MORAL' : 'FISICA' };
}

export const esCodigoPostal = (v: unknown): v is string => typeof v === 'string' && /^\d{5}$/.test(v);
export const esClaveProdServ = (v: unknown): v is string => typeof v === 'string' && /^\d{8}$/.test(v);
export const esClaveUnidad = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{2,3}$/.test(v);
export const esSerie = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{1,25}$/.test(v);
export const esEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
