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

// Quién puede aplicar descuento a una cuenta abierta (PUT /pos/sales/:id/discount). El mesero no.
export const ROLES_DESCUENTO = ['ADMIN', 'GERENTE', 'CAPITAN', 'CAJERO'];

// Quién puede registrar un pago CORTESIA (la venta se da sin cobro). El resto de roles recibe 403. Un descuento tiene
// tope por rol; una cortesía es 100 %, así que solo la autoriza quien no tiene tope.
export const ROLES_CORTESIA = ['ADMIN', 'GERENTE'];

// Tope de descuento por rol, en % del importe. Se valida en el SERVIDOR (create() por ítem y PUT /discount sobre el total
// de la cuenta). ADMIN y GERENTE sin tope. Un rol fuera de ROLES_DESCUENTO no llega aquí (403 antes).
export const TOPE_DESCUENTO_PCT: Record<string, number> = { CAJERO: 10, CAPITAN: 20 };
export const topeDescuentoPct = (rol?: string): number => TOPE_DESCUENTO_PCT[rol ?? ''] ?? Number.POSITIVE_INFINITY;

// El IVA ya no es una constante: lo configura cada tenant (y opcionalmente cada producto). Ver config/iva.config.ts.
