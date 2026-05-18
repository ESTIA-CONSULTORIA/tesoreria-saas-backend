import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { PlansService } from '../../plans/plans.service';
import { FEATURE_KEY } from './decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subsService: SubscriptionsService,
    private plansService: PlansService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rawFeature =
      this.reflector.getAllAndOverride<string>(
        FEATURE_KEY,
        [context.getHandler(), context.getClass()],
      );

    // Si el endpoint no requiere feature, deja pasar
    if (!rawFeature) {
      return true;
    }

    const feature = rawFeature.toUpperCase().trim();

    const request = context.switchToHttp().getRequest();

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

    const plan = await this.plansService.findByCode(
      subscription.planCode,
    );

    if (!plan) {
      throw new ForbiddenException('Plan no encontrado');
    }

    const featureMap: Record<string, boolean> = {
      TREASURY: Boolean(plan.allowTreasury),
      POS: Boolean(plan.allowPOS),
      INVENTORY: Boolean(plan.allowInventory),
      RECEIVABLES: Boolean(plan.allowReceivables),
      PAYABLES: Boolean(plan.allowPayables),
      REPORTS: Boolean(plan.allowReports),
    };

    if (!(feature in featureMap)) {
      throw new ForbiddenException(
        `Feature inválida: ${feature}`,
      );
    }

    const allowed = featureMap[feature];

    if (!allowed) {
      throw new ForbiddenException(
        `El plan ${plan.code} no permite ${feature}`,
      );
    }

    return true;
  }
}
