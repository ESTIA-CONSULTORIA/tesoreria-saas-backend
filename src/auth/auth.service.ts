import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(
    AuthService.name,
  );

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    tenantId?: string,
    role = 'ADMIN',
  ) {
    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();

    const normalizedRole = String(role || 'ADMIN')
      .trim()
      .toUpperCase();

    if (!normalizedEmail) {
      throw new BadRequestException(
        'Email requerido',
      );
    }

    if (!String(password || '').trim()) {
      throw new BadRequestException(
        'Password requerido',
      );
    }

    const allowedRoles = ['ADMIN', 'MANAGER', 'USER'];

    if (!allowedRoles.includes(normalizedRole)) {
      throw new BadRequestException('Rol inválido');
    }

    const existingUser = await this.usersService.findByEmail(
      normalizedEmail,
    );

    if (existingUser) {
      throw new BadRequestException(
        'El correo ya está registrado',
      );
    }

    const hashedPassword = await bcrypt.hash(
      password.trim(),
      10,
    );

    const user = await this.usersService.create(
      normalizedEmail,
      hashedPassword,
      tenantId?.trim(),
      normalizedRole,
    );

    this.logger.log(
      `Usuario registrado: ${normalizedEmail}`,
    );

    return {
      message: 'Usuario creado correctamente',
      userId: user.id,
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      throw new UnauthorizedException(
        'Credenciales incorrectas',
      );
    }

    const user = await this.usersService.findByEmail(
      normalizedEmail,
    );

    if (!user) {
      this.logger.warn(
        `Login inválido para ${normalizedEmail}`,
      );

      throw new UnauthorizedException(
        'Credenciales incorrectas',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password.trim(),
      user.password,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        `Password inválido para ${normalizedEmail}`,
      );

      throw new UnauthorizedException(
        'Credenciales incorrectas',
      );
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });

    this.logger.log(
      `Login exitoso: ${normalizedEmail}`,
    );

    return {
      access_token: token,
    };
  }
}
