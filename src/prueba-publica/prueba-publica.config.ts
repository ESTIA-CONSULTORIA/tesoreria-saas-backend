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
