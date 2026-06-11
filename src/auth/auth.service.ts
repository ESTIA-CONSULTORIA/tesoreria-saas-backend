import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AddonsService } from '../addons/addons.service';
import { getModulesByPlan, Plan, ALL_MODULES } from '../config/modules-by-plan.config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private subscriptionsService: SubscriptionsService,
    private addonsService: AddonsService,
  ) {}

  async register(email: string, password: string) {
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new BadRequestException('El correo ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create(email, hashedPassword);

    return {
      message: 'Usuario creado correctamente',
      userId: user.id,
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    console.log('JWT payload companyId:', user.companyId);
    console.log('JWT payload branchId:', user.branchId);

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      roleCode: user.roleCode,
      tenantId: user.tenantId,
      companyId: user.companyId || null,
      branchId: user.branchId || null,
    }, { expiresIn: '24h' });

    // Calcular módulos activos según rol y tenant
    let modulosActivos: string[] = [];
    if (user.roleCode === 'SOPORTE') {
      // SOPORTE tiene acceso a todos los módulos
      modulosActivos = ALL_MODULES;
    } else if (user.tenantId) {
      // Otros roles: obtener módulos según plan del tenant
      const subscription = await this.subscriptionsService.findByTenant(user.tenantId);
      if (subscription) {
        const plan = subscription.planCode as Plan;
        modulosActivos = getModulesByPlan(plan);
      }

      // Agregar módulos de addons activos
      const addonModules = await this.addonsService.getActiveModulesByTenant(user.tenantId);
      modulosActivos = [...modulosActivos, ...addonModules];
    }

    return {
      access_token: token,
      modulosActivos,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleCode: user.roleCode,
        tenantId: user.tenantId,
        companyId: user.companyId || null,
        branchId: user.branchId || null,
      },
    };
  }
}