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

    const tenantId = request.headers['tenant-id'];
    const userTenantId = request.user?.tenantId;

    if (!tenantId || !userTenantId) {
      throw new ForbiddenException('Tenant context missing');
    }

    if (String(tenantId) !== String(userTenantId)) {
      throw new ForbiddenException('Tenant access denied');
    }

    return true;
  }
}
