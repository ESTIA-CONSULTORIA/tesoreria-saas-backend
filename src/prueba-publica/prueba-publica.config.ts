// Prueba pública (docs/DISENO-PRUEBA-PUBLICA.md, fase PP0). Decisiones aprobadas: Turnstile, 14 días, topes 50/20/3,
// retención 30 días, solo SOPORTE convierte, solo giros con plantilla.

/** Interruptor general. APAGADO por defecto: sin PRUEBA_PUBLICA_ACTIVA=true los endpoints responden 404, como si no existieran. */
export const pruebaPublicaActiva = (): boolean => process.env.PRUEBA_PUBLICA_ACTIVA === 'true';

export const PLAN_PRUEBA = 'PRUEBA';
export const DIAS_PRUEBA = 14;
export const RETENCION_DIAS = 30; // tras vencer, antes de poder purgar
export const TOKEN_MINUTOS = 30;
export const MAX_ACTIVAS = 50;
export const MAX_ALTAS_DIA = 20;
export const MAX_POR_IP_HORA = 3;
export const MAX_USUARIOS_PRUEBA = 5;
/** Solo los giros que ya tienen plantilla de datos. */
export const GIROS_PRUEBA = ['gimnasio'] as const;
export type GiroPrueba = (typeof GIROS_PRUEBA)[number];

export type EstadoPrueba = 'SOLICITADA' | 'ACTIVA' | 'VENCIDA' | 'CONVERTIDA' | 'PURGADA' | 'FALLIDA';

/**
 * Variables que DEBEN estar bien definidas para que la prueba pueda operar. Devuelve solo los NOMBRES de las que faltan (nunca
 * valores). Con el interruptor encendido y algo faltante, los endpoints responden 503 y no hacen nada.
 */
export function variablesFaltantes(env: NodeJS.ProcessEnv = process.env): string[] {
  const f: string[] = [];
  if (!env.PRUEBA_PUBLICA_SAL || env.PRUEBA_PUBLICA_SAL.length < 16) f.push('PRUEBA_PUBLICA_SAL (mín. 16 caracteres)');
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32) f.push('ENCRYPTION_KEY (mín. 32 caracteres)');
  if (!env.TURNSTILE_SECRET) f.push('TURNSTILE_SECRET');
  if (!/^https:\/\//.test(env.PRUEBA_AVISO_URL ?? '')) f.push('PRUEBA_AVISO_URL (https://…)');
  if (!env.PRUEBA_AVISO_VERSION) f.push('PRUEBA_AVISO_VERSION');
  if (!/^https:\/\//.test(env.PRUEBA_PUBLICA_URL_BASE ?? '')) f.push('PRUEBA_PUBLICA_URL_BASE (https://…)');
  const proveedor = (env.CORREO_PROVIDER ?? 'mock').toLowerCase();
  if (proveedor === 'resend') {
    if (!env.RESEND_API_KEY) f.push('RESEND_API_KEY');
    if (!env.CORREO_REMITENTE) f.push('CORREO_REMITENTE');
  } else if (env.NODE_ENV !== 'test' && env.NODE_ENV !== 'development') {
    // En Railway NODE_ENV puede venir vacío: por eso se permite el mock solo en test/development, no «todo menos production».
    f.push('CORREO_PROVIDER (el adaptador mock no envía nada: solo se permite en test o development)');
  }
  return f;
}
