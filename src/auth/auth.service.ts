import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { getModulesByPlan, Plan } from '../config/modules-by-plan.config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private subscriptionsService: SubscriptionsService,
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

  async login(email: string, password: string, tenantId?: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
    });

    // Obtener módulos activos según el plan del tenant
    let modulosActivos: string[] = [];
    if (tenantId) {
      const subscription = await this.subscriptionsService.findByTenant(tenantId);
      if (subscription) {
        const plan = subscription.planCode as Plan;
        modulosActivos = getModulesByPlan(plan);
      }
    }

    return {
      access_token: token,
      modulosActivos,
    };
  }
}