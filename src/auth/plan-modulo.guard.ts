import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantModule } from '../modules/entities/tenant-module.entity';
import { getModulesByPlan, Plan } from '../config/modules-by-plan.config';
import { MODULO_KEY } from './modulo.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class PlanModuloGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(TenantModule)
    private tenantModuleRepo: Repository<TenantModule>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredModulo = this.reflector.getAllAndOverride<string>(MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredModulo) return true;

    if (requiredModulo === 'dashboard') return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) return true;

    if (user.roleCode === 'SOPORTE' || user.executiveAccess === true) return true;

    // PASO 1: tenant_modules (nueva arquitectura)
    const tenantMod = await this.tenantModuleRepo.findOne({
      where: { tenantId: user.tenantId, moduleCode: requiredModulo, status: 'active' },
    });
    if (tenantMod) return true;

    // PASO 2: fallback a config estática (legacy)
    const modulosActivos = getModulesByPlan((user.plan || 'BASIC') as Plan);
    if (modulosActivos.includes(requiredModulo)) return true;

    throw new ForbiddenException(`Módulo '${requiredModulo}' no disponible en tu plan`);
  }
}
