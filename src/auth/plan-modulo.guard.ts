import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantModule } from '../modules/entities/tenant-module.entity';
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

    // tenant_modules es la única fuente de verdad (Sistema 3). Sin fallback a config estática.
    const tenantMod = await this.tenantModuleRepo.findOne({
      where: { tenantId: user.tenantId, moduleCode: requiredModulo, status: 'active' },
    });
    if (tenantMod) return true;

    throw new ForbiddenException(`Módulo '${requiredModulo}' no disponible en tu plan`);
  }
}
