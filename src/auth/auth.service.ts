import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { HrService } from '../hr/hr.service';
import { TenantsService } from '../tenants/tenants.service';
import { ALL_MODULES } from '../config/all-modules.config';
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

  // Compartido por login(), serviceLogin() y portalLogin() (portalLogin llama a login())
  // — mismo bcrypt.compare para todos, no una copia. El mensaje de credenciales
  // incorrectas es siempre el mismo genérico tanto si el email no existe como si la
  // contraseña es incorrecta, para no filtrar cuáles emails están registrados.
  private async verifyCredentials(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Auditoría de seguridad (GoodsHabits): isActive:false no bloqueaba nada acá — una
    // cuenta desactivada seguía autenticando con normalidad mientras la contraseña
    // siguiera siendo la correcta. Mensaje distinto a propósito (no el genérico de
    // arriba): a esta altura ya se probó que la contraseña es correcta, así que no hay
    // nada nuevo que enumerar ocultándolo — y un empleado/soporte real necesita saber
    // que la cuenta existe pero está desactivada, no adivinar si escribió mal algo.
    if (user.isActive === false) {
      throw new UnauthorizedException('Cuenta desactivada');
    }

    return user;
  }

  async login(email: string, password: string, skipAttendanceGate = false) {
    const user = await this.verifyCredentials(email, password);

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

  // Exclusivo para cuentas de servicio server-to-server (ej. DeliveryHub Pro), que no
  // tienen sesión de navegador y por lo tanto no pueden usar cookies httpOnly. Devuelve
  // los tokens en el body en vez de setearlos como cookies (auth.controller.ts hace esa
  // parte). El gate de roleCode/tenantId corre DESPUÉS de verifyCredentials(): si la
  // contraseña es incorrecta, siempre es 401 genérico igual que login() — no se filtra
  // si el email pertenece o no a una cuenta de servicio antes de probar la contraseña.
  async serviceLogin(email: string, password: string) {
    const user = await this.verifyCredentials(email, password);

    // Mismo patrón que ya identifica a las cuentas de servicio (ver
    // delivery-ingest.controller.ts:14 — deliveryhub@service.estia es SOPORTE con
    // tenantId null). Esto NO es una puerta trasera para evitar cookies en logins
    // normales: cualquier usuario con tenantId real se rechaza aquí aunque la
    // contraseña sea correcta.
    if (user.roleCode !== 'SOPORTE' || user.tenantId) {
      throw new ForbiddenException('Este endpoint es exclusivo para cuentas de servicio');
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
            name: user.name,
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
            tenantId: user.tenantId,
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
    // UPDATE atómico en vez de findOne()+save(): con eso, dos peticiones casi simultáneas
    // con el mismo refresh_token (varias pestañas, o varias llamadas en paralelo del
    // frontend antes de la deduplicación del interceptor) podían leer revoked:false las
    // dos ANTES de que cualquiera escribiera revoked:true — ambas pasaban y generaban un
    // par nuevo cada una, resultado no determinístico (confirmado: 2 de 4 fallaban en
    // pruebas reales). El WHERE revoked=false en el UPDATE hace que como mucho una fila
    // se actualice; la segunda petición no encuentra nada que afectar y cae limpio a 401.
    const result = await this.refreshTokenRepo.query(
      `UPDATE refresh_tokens SET revoked = true WHERE token = $1 AND revoked = false AND "expiresAt" > NOW() RETURNING *`,
      [token],
    );
    const stored = result[0]?.[0];
    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.usersRepo.findOne({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const modulosActivos = await this.getModulosActivos(stored.tenantId, user.roleCode || '');
    return this.generateTokens(user, modulosActivos);
  }

  // Variante de refreshAccessToken() para cuentas de servicio: lee el refresh_token del
  // body en vez de una cookie. Antes de tocar la rotación atómica, hace un SELECT de
  // solo lectura para identificar al dueño del token y validar el gate SOPORTE +
  // tenantId null — a propósito NO reutiliza refreshAccessToken() directo primero,
  // porque ese método revoca el token en el mismo UPDATE que lo lee. Si este endpoint
  // recibiera por error/abuso el refresh_token de un usuario normal, revocarlo como
  // efecto secundario del gate invalidaría su sesión legítima sin motivo; con el SELECT
  // previo, un token que no pasa el gate se rechaza sin haber sido tocado.
  async serviceRefreshAccessToken(token: string) {
    const result = await this.refreshTokenRepo.query(
      `SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = false AND "expiresAt" > NOW()`,
      [token],
    );
    const stored = result[0];
    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    const user = await this.usersRepo.findOne({ where: { id: stored.userId } });
    if (!user || user.roleCode !== 'SOPORTE' || user.tenantId) {
      throw new ForbiddenException('Este endpoint es exclusivo para cuentas de servicio');
    }

    // Gate superado: recién ahora la rotación atómica normal (consume el token).
    return this.refreshAccessToken(token);
  }

  async revokeRefreshToken(token: string) {
    await this.refreshTokenRepo.update({ token }, { revoked: true });
    return { message: 'Sesión cerrada correctamente' };
  }
}