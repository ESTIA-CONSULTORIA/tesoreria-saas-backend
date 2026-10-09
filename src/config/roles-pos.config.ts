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

// Tope de descuento por rol, en % del importe. Se valida en el SERVIDOR (create() por ítem y PUT /discount sobre el total
// de la cuenta). ADMIN y GERENTE sin tope. Un rol fuera de ROLES_DESCUENTO no llega aquí (403 antes).
export const TOPE_DESCUENTO_PCT: Record<string, number> = { CAJERO: 10, CAPITAN: 20 };
export const topeDescuentoPct = (rol?: string): number => TOPE_DESCUENTO_PCT[rol ?? ''] ?? Number.POSITIVE_INFINITY;

// IVA del POS (el mismo 16% del POS normal del frontend: precios sin IVA, IVA sobre el neto). Las cuentas abiertas lo
// calculan en el SERVIDOR con esta tasa; el cliente no decide ni precio ni impuesto.
export const IVA_TASA = 0.16;
export const calcularIva = (neto: number): number => Math.round(neto * IVA_TASA * 100) / 100;
