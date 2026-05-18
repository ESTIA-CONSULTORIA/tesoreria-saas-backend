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

    const path = String(request.url || '');

    // Rutas públicas estrictamente necesarias
    if (
      path.startsWith('/auth') ||
      path.startsWith('/plans')
    ) {
      return true;
    }

    const tenantId = String(
      request.user?.tenantId ||
        request.headers['tenant-id'] ||
        '',
    ).trim();

    if (!tenantId) {
      throw new ForbiddenException(
        'Tenant no identificado',
      );
    }

    const subscription = await this.subsService.findByTenant(
      tenantId,
    );

    if (!subscription) {
      throw new ForbiddenException('Sin suscripción');
    }

    const today = new Date();

    const endDate = subscription.endDate
      ? new Date(subscription.endDate)
      : null;

    const status = String(
      subscription.status || '',
    ).toUpperCase();

    if (!endDate || Number.isNaN(endDate.getTime())) {
      throw new ForbiddenException(
        'Suscripción inválida',
      );
    }

    if (status !== 'ACTIVE' || endDate < today) {
      throw new ForbiddenException(
        'Suscripción vencida',
      );
    }

    return true;
  }
}
