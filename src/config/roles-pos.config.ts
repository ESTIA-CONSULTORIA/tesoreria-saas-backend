// Roles del POS y qué puede hacer cada uno. roleCode es texto en el usuario (sin FK); los roles son
// GLOBALES (tabla `role`, code único, sin tenantId): crear uno lo hace disponible para todos los tenants.

// Roles que operan sobre datos de UNA sucursal: exigen empresa y sucursal asignadas (regla de aplicación
// en UsersService; la CHECK de BD de la migración 1787818605257 solo cubre CAJERO y GERENTE).
export const ROLES_CON_SUCURSAL = ['CAJERO', 'GERENTE', 'MESERO', 'CAPITAN'];

// Roles que entran al POS Lite con NIP de 4 dígitos (POST /pos/cashiers/nip).
export const ROLES_NIP = ['CAJERO', 'MESERO', 'CAPITAN'];

// "Caja": sesión ERP con uno de estos roles. Todo lo demás es "mesa" (sesión POS Lite, o sesión ERP con
// MESERO o CAPITAN): así un mesero con sesión ERP no se salta la política.
export const ROLES_CAJA = ['ADMIN', 'GERENTE', 'CAJERO'];
