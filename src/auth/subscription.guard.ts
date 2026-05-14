import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private subsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const tenantId = request.headers['tenant-id'];

    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado');
    }

    const subscription = await this.subsService.findByTenant(tenantId);

    if (!subscription) {
      throw new ForbiddenException('Sin suscripción');
    }

    const today = new Date();
    const endDate = new Date(subscription.endDate);

    if (subscription.status !== 'ACTIVE' || endDate < today) {
      throw new ForbiddenException('Suscripción vencida');
    }

    return true;
  }
}