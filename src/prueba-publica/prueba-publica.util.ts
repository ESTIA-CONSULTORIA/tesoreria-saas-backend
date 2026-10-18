import { createHash, randomBytes } from 'crypto';

// Piezas puras de la prueba pública (con spec).

export const normalizarCorreo = (c: unknown): string => String(c ?? '').trim().toLowerCase();

export const esCorreoValido = (c: string): boolean => c.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);

export const dominioDe = (c: string): string => c.slice(c.lastIndexOf('@') + 1);

// Dominios desechables más comunes; la lista completa y su actualización llegan con PP1.
export const DOMINIOS_DESECHABLES = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com'];
export const esDesechable = (dominio: string): boolean => DOMINIOS_DESECHABLES.includes(dominio.toLowerCase());

// La sal sale del entorno (nunca del código). Sin ella no se puede operar: error claro.
export function hashCorreo(correoNormalizado: string, sal = process.env.PRUEBA_PUBLICA_SAL): string {
  if (!sal || sal.length < 16) throw new Error('PRUEBA_PUBLICA_SAL no está configurada (mínimo 16 caracteres).');
  return createHash('sha256').update(`${sal}|${correoNormalizado}`).digest('hex');
}

/** Token de 32 bytes aleatorios (url-safe). Solo su hash se guarda. */
export const generarToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(String(token)).digest('hex');

/** Primer valor de x-forwarded-for (Railway pone la IP real ahí) o la del socket. Es falsificable: por eso también hay topes globales. */
export function ipDe(req: any): string {
  const f = String(req?.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return (f || req?.ip || 'desconocida').slice(0, 64);
}

/** Contraseña inicial que elige la persona: mínimo 10, con letra y número. */
export function validarPassword(p: unknown): string | null {
  const s = String(p ?? '');
  if (s.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (s.length > 128) return 'La contraseña es demasiado larga.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'La contraseña debe llevar letras y números.';
  return null;
}

export const slugPrueba = (): string => `prueba-${randomBytes(5).toString('hex')}`;
