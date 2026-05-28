export enum Plan {
  BASIC = 'BASIC',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
  ENTERPRISE = 'ENTERPRISE',
}

export const MODULES_BY_PLAN: Record<Plan, string[]> = {
  [Plan.BASIC]: [
    'dashboard',
    'empresas',
    'sucursales',
    'bancos',
    'movimientos',
    'transferencias',
  ],
  [Plan.PRO]: [
    'dashboard',
    'empresas',
    'sucursales',
    'bancos',
    'movimientos',
    'transferencias',
    'reportes',
    'tesoreria',
    'conciliacion',
  ],
  [Plan.BUSINESS]: [
    'dashboard',
    'empresas',
    'sucursales',
    'bancos',
    'movimientos',
    'transferencias',
    'reportes',
    'tesoreria',
    'conciliacion',
    'configuracion-pos',
    'integraciones',
  ],
  [Plan.ENTERPRISE]: [
    'dashboard',
    'empresas',
    'sucursales',
    'bancos',
    'movimientos',
    'transferencias',
    'reportes',
    'tesoreria',
    'conciliacion',
    'configuracion-pos',
    'integraciones',
    'rh',
    'sat-cfdi',
    'white-label',
  ],
};

export function getModulesByPlan(plan: Plan): string[] {
  return MODULES_BY_PLAN[plan] || [];
}
