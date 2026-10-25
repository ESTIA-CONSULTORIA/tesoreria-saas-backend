// Decide qué sembrar al arrancar. seedDatabase() crea tenants, usuarios con contraseñas conocidas (Admin123, 1234,
// admin123), datos de ejemplo y hasta resetea la contraseña de cajero@demo.com: en producción solo debe correr si
// alguien lo pide explícitamente con SEED_DEMO_EN_PRODUCCION=true. Los catálogos estructurales (roles, módulos,
// planes, conceptos de nómina) corren siempre vía seedCatalogos().

export type PlanDeSeed = 'demo-completo' | 'solo-catalogos';

export function planDeSeed(env: Record<string, string | undefined> = process.env): PlanDeSeed {
  // Railway no define NODE_ENV en este servicio: también se reconoce por el nombre del ambiente.
  const norm = (v?: string) => (v ?? '').trim().toLowerCase();
  const esProduccion = norm(env.NODE_ENV) === 'production' || norm(env.RAILWAY_ENVIRONMENT_NAME) === 'production';
  if (!esProduccion) return 'demo-completo';
  return norm(env.SEED_DEMO_EN_PRODUCCION) === 'true' ? 'demo-completo' : 'solo-catalogos';
}
