import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { TenantsService } from '../tenants/tenants.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private subsService: SubscriptionsService,
    private tenantsService: TenantsService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Solo SOPORTE tiene acceso sin restricciones de suscripción. Vista Ejecutiva
    // (executiveAccess) YA NO bypasea este guard — si la suscripción del tenant está
    // vencida/inactiva, su Vista Ejecutiva se corta igual que el resto del sistema
    // (decisión de negocio confirmada, corrección de seguridad).
    if (user && user.roleCode === 'SOPORTE') {
      return true;
    }

    const path = request.url;

    // Rutas públicas (login, planes, suscripciones)
    if (
      path.startsWith('/auth') ||
      path.startsWith('/plans') ||
      path.startsWith('/subscriptions')
    ) {
      return true;
    }

    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Sesión inválida');
    }

    const subscription = await this.subsService.findByTenant(tenantId);

    if (!subscription) {
      // Tenant legacy sin suscripción formal — crear una automática por 30 días
      const tenant = await this.tenantsService.findOne(tenantId);
      if (!tenant?.plan) throw new ForbiddenException('Sin suscripción');
      await this.subsService.createForTenant(tenant.id, tenant.plan, 'monthly');
      return true;
    }

    const today = new Date();
    const endDate = subscription.endDate ? new Date(subscription.endDate) : null;

    if (subscription.status !== 'ACTIVE' || (endDate && endDate < today)) {
      throw new ForbiddenException('Suscripción vencida — contacta a ESTIA Consultoría para renovar');
    }

    return true;
  }
}