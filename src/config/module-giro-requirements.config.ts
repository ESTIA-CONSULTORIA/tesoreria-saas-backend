import { Giro } from './giros.config';

// Auditoría de producto (GoodsHabits, Hallazgo 3): módulos verticales que solo tienen
// sentido para ciertos giros de negocio. Un moduleCode que NO aparece aquí no tiene
// restricción de giro — se rige únicamente por el plan (ver seed.ts, PLAN_MODULES), igual
// que antes de este mecanismo.
//
// Para sumar un módulo nuevo de un vertical futuro (ESTIA Health cuando se retome,
// Restaurant, Retail...) basta agregar su entrada aquí — modules.service.ts no necesita
// tocarse de nuevo.
export const MODULE_GIRO_REQUIREMENTS: Partial<Record<string, Giro[]>> = {
  pacientes: ['medico_dental', 'medico_general'],
};

// true si el módulo no tiene restricción de giro declarada, o si el giro dado la cumple.
export function moduleAllowedForGiro(moduleCode: string, giro: string): boolean {
  const required = MODULE_GIRO_REQUIREMENTS[moduleCode];
  if (!required) return true;
  return required.includes(giro as Giro);
}
