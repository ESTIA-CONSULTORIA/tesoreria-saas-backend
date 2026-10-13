import { ForbiddenException } from '@nestjs/common';

// Acceso a un recurso de tenant por id: SOPORTE ve cualquiera; el resto solo el tenant de su token.
// Sin usuario o sin tenantId en el token no hay acceso (nunca se asume "propio" por omisión).
export function assertTenantAccess(
  user: { roleCode?: string; tenantId?: string | null } | undefined | null,
  tenantId: string,
  mensaje = 'No tienes permiso para acceder a otro tenant',
): void {
  if (user?.roleCode === 'SOPORTE') return;
  if (!user?.tenantId || user.tenantId !== tenantId) throw new ForbiddenException(mensaje);
}

export const esSoporte = (user?: { roleCode?: string } | null): boolean => user?.roleCode === 'SOPORTE';

// Tenant al que se acota una operación por id/listado: el del TOKEN (nunca el del query/body). SOPORTE → undefined
// (sin acotar). Cualquier otro rol sin tenantId en el token no opera.
export function tenantDeSesion(req: any): string | undefined {
  const user = req?.user;
  if (user?.roleCode === 'SOPORTE') return undefined;
  if (!user?.tenantId) throw new ForbiddenException('Sesión sin tenant');
  return user.tenantId as string;
}
