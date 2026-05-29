import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private subsService: SubscriptionsService,
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

    const path = request.url;

    // Rutas públicas (login, planes, suscripciones)
    if (
      path.startsWith('/auth') ||
      path.startsWith('/plans') ||
      path.startsWith('/subscriptions')
    ) {
      return true;
    }

    // SUPER_ADMIN tiene acceso a todo sin restricciones de suscripción
    const user = request.user;
    console.log('SubscriptionGuard - user:', user);
    console.log('SubscriptionGuard - user.rol:', user?.rol);
    console.log('SubscriptionGuard - user.roleCode:', user?.roleCode);
    
    if (user && user.rol === 'SUPER_ADMIN') {
      console.log('SubscriptionGuard - SUPER_ADMIN bypass activated');
      return true;
    }

    const tenantId = request.headers['tenant-id'];

    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado');
    }

    const subscription = await this.subsService.findByTenant(tenantId);

    if (!subscription) {
      throw new ForbiddenException('Sin suscripción');
    }

    const today = new Date();
    const endDate = subscription.endDate
  ? new Date(subscription.endDate)
  : null;

    if (
  subscription.status !== 'ACTIVE' ||
  (endDate && endDate < today)
) {
      throw new ForbiddenException('Suscripción vencida');
    }

    return true;
  }
}