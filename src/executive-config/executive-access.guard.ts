import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Restringe a sesiones con el flag executiveAccess del JWT de /auth/executive-login (más
// SOPORTE, por consistencia con el resto del sistema) — la config de Vista Ejecutiva no
// debe ser editable desde una sesión ERP normal aunque sea del mismo ADMIN/GERENTE.
@Injectable()
export class ExecutiveAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.executiveAccess === true || user?.roleCode === 'SOPORTE') {
      return true;
    }

    throw new ForbiddenException('Requiere acceso de Vista Ejecutiva');
  }
}
