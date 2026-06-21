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
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si el endpoint no requiere feature, deja pasar
    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado');
    }

    const subscription = await this.subsService.findByTenant(tenantId);

    if (!subscription) {
      throw new ForbiddenException('Sin suscripción');
    }

    const plan = await this.plansService.findByCode(subscription.planCode);

    if (!plan) {
      throw new ForbiddenException('Plan no encontrado');
    }

    const featureMap: Record<string, boolean> = {
      TREASURY: plan.allowTreasury,
      POS: plan.allowPOS,
      INVENTORY: plan.allowInventory,
      RECEIVABLES: plan.allowReceivables,
      PAYABLES: plan.allowPayables,
      REPORTS: plan.allowReports,
    };

    const allowed = featureMap[feature];

    if (!allowed) {
      throw new ForbiddenException(
        `El plan ${plan.code} no permite ${feature}`,
      );
    }

    return true;
  }
}