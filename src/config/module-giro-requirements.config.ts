import { Giro } from './giros.config';

// Auditoría de producto (GoodsHabits, Hallazgo 3): módulos verticales que solo tienen
// sentido para ciertos giros de negocio. Un moduleCode que NO aparece aquí no tiene
// restricción de giro — se rige únicamente por el plan (ver seed.ts, PLAN_MODULES), igual
// que antes de este mecanismo.
//
// Para sumar un módulo nuevo de un vertical futuro (ESTIA Health cuando se retome,
// Restaurant, Retail...) basta agregar su entrada aquí — modules.service.ts no necesita
// tocarse de nuevo.
//
// 'pacientes' — decisión de producto CONFIRMADA (Miguel, 2026-09-20, tras la auditoría
// funcional BUSINESS): este archivo ya bloqueaba silenciosamente la activación de
// 'pacientes' para cualquier tenant que no fuera de giro médico/dental — eso es correcto y
// se queda igual. Lo que cambió es que 'pacientes' se retiró del listado genérico
// PLAN_MODULES.BUSINESS en seed.ts, porque prometerlo ahí era engañoso: un tenant BUSINESS
// de giro no-médico nunca iba a poder activarlo de todos modos (este mismo archivo se lo
// impedía), así que listarlo como "incluido en BUSINESS" sugería una disponibilidad que en
// la práctica no existía para casi nadie.
//
// El comportamiento real no cambia: 'pacientes' sigue siendo un módulo real y activable —
// vía initFromPlan() para cualquier plan que SÍ lo liste (hoy BASIC), o a mano por SOPORTE
// vía ModulesService.activateModule() (así se activó para el único tenant real que lo usa,
// "Riova", con giro medico_dental) — y en ambos casos sigue condicionado exclusivamente al
// giro que se define aquí, nunca al plan. Es decir: 'pacientes' es y siempre fue un módulo
// exclusivo de giro médico/dental, disponible automáticamente en cuanto el giro califica;
// ya no se anuncia además como si fuera parte del paquete estándar de BUSINESS.
export const MODULE_GIRO_REQUIREMENTS: Partial<Record<string, Giro[]>> = {
  pacientes: ['medico_dental', 'medico_general'],
};

// true si el módulo no tiene restricción de giro declarada, o si el giro dado la cumple.
export function moduleAllowedForGiro(moduleCode: string, giro: string): boolean {
  const required = MODULE_GIRO_REQUIREMENTS[moduleCode];
  if (!required) return true;
  return required.includes(giro as Giro);
}
