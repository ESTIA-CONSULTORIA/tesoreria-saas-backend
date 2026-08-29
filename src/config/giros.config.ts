// Auditoría de producto (GoodsHabits, Hallazgo 3): catálogo de giros de negocio. Determina
// qué módulos verticales puede tener un tenant, ADEMÁS de lo que ya permite su plan (ver
// module-giro-requirements.config.ts) — no reemplaza esa capa, la restringe más.
//
// Abierto a propósito: hoy solo 'medico_dental' tiene un tenant real en uso (Riova), pero
// el resto de los giros médicos/verticales de largo plazo (ESTIA Health completo,
// Restaurant, Retail...) ya están declarados aquí para que activarlos en el futuro sea
// agregar módulos a module-giro-requirements.config.ts, no tocar este catálogo ni el
// mecanismo de gating.
export const GIROS = [
  'generico',
  'medico_dental',
  'medico_general',
  'restaurante',
  'retail',
] as const;

export type Giro = typeof GIROS[number];

export const DEFAULT_GIRO: Giro = 'generico';

export function isValidGiro(value: string): value is Giro {
  return (GIROS as readonly string[]).includes(value);
}

// Etiquetas legibles — únicamente para el selector de SOPORTE (GET /tenants/giros). El
// código (GIROS de arriba) es lo único que se persiste y se evalúa.
export const GIRO_LABELS: Record<Giro, string> = {
  generico: 'Genérico',
  medico_dental: 'Médico — Dental',
  medico_general: 'Médico — General',
  restaurante: 'Restaurante',
  retail: 'Retail',
};
