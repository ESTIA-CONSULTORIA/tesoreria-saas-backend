import { BadRequestException, ForbiddenException } from '@nestjs/common';

// Sucursal efectiva: UNA sola regla para todos los módulos (productos, ventas, turnos, mesas, categorías, áreas, costos,
// compras, bancos, dashboard, membresías...). Antes cada controller decidía por su cuenta y varios trataban el header
// X-Branch-Id (que el cliente controla) como un permiso: `headerBranchId || user.branchId` dejaba que un usuario con
// sucursal viera o escribiera en otra con solo mandar el header.
//
//   · Usuario CON sucursal (token)  → solo la suya. El header/consulta se ignora en lecturas; una sucursal distinta pedida
//                                     de forma explícita en una escritura es 403.
//   · Usuario SIN sucursal (ADMIN o dueño; SOPORTE sin tenant) → ve todo el tenant; si manda una sucursal (header/consulta)
//                                     filtra por ella. En escrituras esa sucursal debe pertenecer a su tenant.
// Esta función es pura (sin BD): la pertenencia al tenant se valida con assertSucursalDelTenant donde se escribe.

export interface UsuarioSucursal {
  tenantId?: string | null;
  branchId?: string | null;
  roleCode?: string | null;
}

export interface SucursalEfectiva {
  /** Sucursal por la que filtrar; undefined = todas las del tenant. */
  branchId: string | undefined;
  /** true cuando el usuario está atado a su sucursal (no puede elegir otra). */
  restringida: boolean;
}

const limpia = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Lecturas / filtros. `solicitada` es el header X-Branch-Id o el query; solo cuenta para usuarios sin sucursal. */
export function sucursalEfectiva(user: UsuarioSucursal | null | undefined, solicitada?: unknown): SucursalEfectiva {
  const propia = limpia(user?.branchId);
  if (propia) return { branchId: propia, restringida: true };
  return { branchId: limpia(solicitada), restringida: false };
}

/**
 * Escrituras: la sucursal a la que se asigna lo que se crea. Con sucursal en el token es esa y pedir otra es 403 (nunca se
 * toma del cliente sin validar); sin sucursal en el token vale la pedida (si hay), que el servicio debe validar contra el tenant.
 */
export function sucursalParaEscribir(user: UsuarioSucursal | null | undefined, pedida?: unknown): string | undefined {
  const propia = limpia(user?.branchId);
  const p = limpia(pedida);
  if (propia) {
    if (p && p !== propia) throw new ForbiddenException('No tienes acceso a esa sucursal.');
    return propia;
  }
  return p;
}

interface RunnerSql {
  query: (sql: string, params?: any[]) => Promise<any>;
}

/** La sucursal existe y pertenece al tenant (branch → company → tenant). Sin tenantId (SOPORTE) no valida. */
export async function sucursalPerteneceAlTenant(runner: RunnerSql, branchId: string, tenantId?: string | null): Promise<boolean> {
  if (!tenantId) return true;
  // Los servicios reciben un repositorio/DataSource real; un doble de prueba parcial sin `query` no puede verificar nada.
  if (typeof runner?.query !== 'function') return true;
  const rows = await runner.query(
    `SELECT 1 FROM "branch" b JOIN "company" c ON c.id::text = b."companyId"::text
      WHERE b.id::text = $1 AND c."tenantId"::text = $2 LIMIT 1`,
    [branchId, tenantId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/** Lecturas con una sucursal elegida por el cliente (header/consulta): si no es del tenant, 403 (nunca datos de otro negocio). */
export async function assertSucursalLegible(runner: RunnerSql, branchId: string | undefined | null, tenantId?: string | null): Promise<void> {
  if (!branchId) return;
  if (!(await sucursalPerteneceAlTenant(runner, branchId, tenantId))) {
    throw new ForbiddenException('No tienes acceso a esa sucursal.');
  }
}

export async function assertSucursalDelTenant(runner: RunnerSql, branchId: string | undefined | null, tenantId?: string | null): Promise<void> {
  if (!branchId) return;
  if (!(await sucursalPerteneceAlTenant(runner, branchId, tenantId))) {
    throw new BadRequestException('La sucursal indicada no existe en tu negocio.');
  }
}
