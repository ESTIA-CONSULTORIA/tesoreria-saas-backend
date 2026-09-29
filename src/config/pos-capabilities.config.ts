// POS flexible — capacidades combinables por tenant (mismo criterio que GIROS en
// giros.config.ts: catálogo tipado en código, no en tabla; agregar la capacidad #2 en
// adelante es sumar una entrada aquí, no tocar el mecanismo de gating ni migrar datos).
//
// Viven en TenantSetting.posCapabilities (columna JSON, ver migración
// AddPosCapabilitiesToTenantSetting) en vez de tenant_modules/ModulesService a propósito:
// tenant_modules es la capa de FACTURACIÓN/entitlement (moduleCode con price/source/
// activatedBy, activada por SOPORTE) — una capacidad dentro de un módulo ya activo
// (configuracion_pos) no se factura aparte y la debe poder prender/apagar el propio ADMIN
// del tenant, mismo tipo de decisión operacional que ya resuelve TenantSetting.stockPolicy.
//
// DEFAULTS: se aplican cuando la fila del tenant no tiene la clave presente en
// posCapabilities (columna nullable, y ninguna fila existente hoy la tiene) — así
// TenantSettingsService.hasPosCapability() nunca necesita backfill ni migración de datos
// para que el comportamiento actual del POS siga funcionando igual para todo el mundo.
// Solo 'venta_directa_producto' tiene alcance construido hoy — es la única de las 5 que ya
// se diseñó e implementó (esta ronda). Las otras 4 ya tienen su nombre real (confirmado por
// Miguel), pero ninguna existe todavía: quedan en el catálogo como reserva de nombre/tipo
// para cuando les toque su propia ronda de diseño + implementación.
export const POS_CAPABILITIES = [
  'venta_directa_producto',
  'mesas_cuenta_abierta',
  'venta_de_servicio',
  'ligar_venta_a_cita',
  'notas_cocina_barra',
] as const;

export type PosCapability = typeof POS_CAPABILITIES[number];

// venta_directa_producto: true — es el comportamiento actual del POS genérico (venta
// inmediata con descuento de inventario vía la cadena de Costos ya unificada), no debe
// romperse para ningún tenant que ya lo use. Las otras 4: false — todavía no existen
// construidas, no hay nada que "activar" (cada una decide su propio default, no
// necesariamente false, cuando se diseñe y construya de verdad en su propia ronda).
export const DEFAULT_POS_CAPABILITIES: Record<PosCapability, boolean> = {
  venta_directa_producto: true,
  mesas_cuenta_abierta: false,
  venta_de_servicio: false,
  ligar_venta_a_cita: false,
  notas_cocina_barra: false,
};

export function isValidPosCapability(value: string): value is PosCapability {
  return (POS_CAPABILITIES as readonly string[]).includes(value);
}
