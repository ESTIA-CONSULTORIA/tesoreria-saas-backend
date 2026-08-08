import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { HrService } from '../hr/hr.service';
import { TenantsService } from '../tenants/tenants.service';
import { getModulesByPlan, Plan, ALL_MODULES } from '../config/modules-by-plan.config';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { TenantModule } from '../modules/entities/tenant-module.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const ATTENDANCE_GATED_ROLES = ['CAJERO', 'MESERO', 'GERENTE', 'CONTADOR', 'EMPLEADO'];

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private subscriptionsService: SubscriptionsService,
    private hrService: HrService,
    private tenantsService: TenantsService,
    @InjectRepository(RefreshToken) private refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(TenantModule) private tenantModuleRepo: Repository<TenantModule>,
  ) {}

  async register(email: string, password: string) {
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new BadRequestException('El correo ya está registrado');
    }

    const user = await this.usersService.create(email, password);

    return {
      message: 'Usuario creado correctamente',
      userId: user.id,
    };
  }

  async login(email: string, password: string, skipAttendanceGate = false) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Attendance gate — gated roles must have checked in before accessing main system
    if (!skipAttendanceGate && user.tenantId && ATTENDANCE_GATED_ROLES.includes(user.roleCode || '')) {
      const employee = await this.hrService.findEmployeeByUserId(user.id);
      if (employee) {
        const attendance = await this.hrService.findTodayAttendanceByEmployee(employee.id);
        if (!attendance?.checkIn) {
          throw new UnauthorizedException(
            'Debes registrar tu asistencia antes de acceder al sistema. Usa el portal del empleado para registrar tu entrada.',
          );
        }
        if (attendance.checkOut) {
          throw new UnauthorizedException(
            'Tu jornada laboral ha terminado. No puedes acceder al sistema.',
          );
        }
      }
    }

    const modulosActivos = await this.getModulosActivos(user.tenantId, user.roleCode || '');
    const { access_token, refresh_token } = await this.generateTokens(user, modulosActivos);

    return {
      access_token,
      refresh_token,
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

  async portalLogin(email: string, password: string) {
    return this.login(email, password, true);
  }

  async switchCompany(userId: string, tenantId: string, companyId: string) {
    const users = await this.usersService.findAll(tenantId);
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const modulosActivos = await this.getModulosActivos(user.tenantId, user.roleCode || '');
    const { access_token, refresh_token } = await this.generateTokens(
      { ...user, companyId: companyId || null },
      modulosActivos,
    );
    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleCode: user.roleCode,
        tenantId: user.tenantId,
        companyId: companyId || null,
      },
    };
  }

  async executiveLogin(tenantId: string, pin: string) {
    if (!tenantId || !pin) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const users = await this.usersService.findAllWithPins(tenantId);
    const candidates = users.filter(
      (u) => ['ADMIN', 'GERENTE'].includes(u.roleCode || '') && u.isActive !== false,
    );
    for (const user of candidates) {
      if (!user.executivePin) continue;
      const valid = await bcrypt.compare(pin, user.executivePin);
      if (valid) {
        const token = this.jwtService.sign(
          {
            sub: user.id,
            email: user.email,
            roleCode: user.roleCode,
            tenantId: user.tenantId,
            companyId: user.companyId || null,
            branchId: user.branchId || null,
            executiveAccess: true,
          },
          { expiresIn: '8h' },
        );
        return {
          access_token: token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            roleCode: user.roleCode,
          },
        };
      }
    }
    throw new UnauthorizedException('PIN incorrecto');
  }

  private async getModulosActivos(tenantId: string, roleCode: string): Promise<string[]> {
    if (roleCode === 'SOPORTE') return ALL_MODULES;
    let modulosActivos: string[] = [];
    if (tenantId) {
      // tenant_modules es la única fuente de verdad (Sistema 3). Ya no se calcula nada a
      // partir del plan (Sistema 1) ni de addons (Sistema 2, retirado en Fase 5).
      const tenantModules = await this.tenantModuleRepo.find({ where: { tenantId, status: 'active' } });
      modulosActivos = [...new Set(tenantModules.map(m => m.moduleCode))];
    }
    return modulosActivos;
  }

  async generateTokens(user: any, modulosActivos: string[]) {
    const payload = {
      sub: user.id,
      email: user.email,
      roleCode: user.roleCode,
      tenantId: user.tenantId,
      companyId: user.companyId || null,
      branchId: user.branchId || null,
      modulosActivos,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });

    let refresh_token: string | null = null;
    try {
      const token = crypto.randomBytes(64).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await this.refreshTokenRepo.save({
        userId: user.id,
        tenantId: user.tenantId,
        token,
        expiresAt,
        revoked: false,
      });
      refresh_token = token;
    } catch (e: any) {
      console.warn('No se pudo guardar refresh token:', e.message);
    }

    return { access_token, refresh_token };
  }

  async refreshAccessToken(token: string) {
    const stored = await this.refreshTokenRepo.findOne({ where: { token, revoked: false } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.usersRepo.findOne({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    stored.revoked = true;
    await this.refreshTokenRepo.save(stored);

    const modulosActivos = await this.getModulosActivos(stored.tenantId, user.roleCode || '');
    return this.generateTokens(user, modulosActivos);
  }

  async revokeRefreshToken(token: string) {
    await this.refreshTokenRepo.update({ token }, { revoked: true });
    return { message: 'Sesión cerrada correctamente' };
  }
}