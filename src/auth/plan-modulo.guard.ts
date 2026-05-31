import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { getModulesByPlan, Plan } from '../config/modules-by-plan.config';
import { MODULO_KEY } from './modulo.decorator';
import { Public } from './public.decorator';

@Injectable()
export class PlanModuloGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar si es público
    const isPublic = this.reflector.getAllAndOverride<boolean>(Public, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Obtener el módulo requerido del decorator
    const requiredModulo = this.reflector.getAllAndOverride<string>(MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si no hay módulo requerido, permitir acceso
    if (!requiredModulo) {
      return true;
    }

    // El módulo dashboard está disponible para todos los planes
    if (requiredModulo === 'dashboard') {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.headers['tenant-id'];

    console.log('PlanModuloGuard - request.user:', user);

    // SOPORTE tiene acceso a todos los módulos
    if (user?.roleCode === 'SOPORTE') {
      return true;
    }

    if (!tenantId) {
      throw new ForbiddenException('Tenant ID requerido');
    }

    // Obtener suscripción del tenant
    const subscription = await this.subscriptionsService.findByTenant(tenantId);

    if (!subscription) {
      throw new ForbiddenException('No se encontró suscripción activa');
    }

    // Obtener módulos del plan
    const plan = subscription.planCode as Plan;
    const modulosActivos = getModulesByPlan(plan);

    // Verificar si el módulo está activo
    if (!modulosActivos.includes(requiredModulo)) {
      throw new ForbiddenException(`El módulo '${requiredModulo}' no está disponible en su plan`);
    }

    return true;
  }
}
