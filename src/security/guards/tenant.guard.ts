import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const headerTenantId = request.headers['tenant-id'];
    const userTenantId = request.user?.tenantId;

    if (!userTenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    // Si no mandan header, usamos JWT directamente
    if (!headerTenantId) {
      return true;
    }

    if (String(headerTenantId) !== String(userTenantId)) {
      throw new ForbiddenException('Tenant access denied');
    }

    return true;
  }
}
