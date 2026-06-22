import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AddonsService } from '../addons/addons.service';
import { HrService } from '../hr/hr.service';
import { getModulesByPlan, Plan, ALL_MODULES } from '../config/modules-by-plan.config';
import * as bcrypt from 'bcrypt';

const ATTENDANCE_GATED_ROLES = ['CAJERO', 'MESERO', 'GERENTE', 'CONTADOR', 'EMPLEADO'];

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private subscriptionsService: SubscriptionsService,
    private addonsService: AddonsService,
    private hrService: HrService,
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

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      roleCode: user.roleCode,
      tenantId: user.tenantId,
      companyId: user.companyId || null,
      branchId: user.branchId || null,
    });

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

  async portalLogin(email: string, password: string) {
    return this.login(email, password, true);
  }

  async switchCompany(userId: string, tenantId: string, companyId: string) {
    const users = await this.usersService.findAll(tenantId);
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      roleCode: user.roleCode,
      tenantId: user.tenantId,
      companyId: companyId || null,
      branchId: user.branchId || null,
    });
    return {
      access_token: token,
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
}