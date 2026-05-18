import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
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

    return {
      message: 'Usuario creado correctamente',
      userId: user.id,
    };
  }

  async login(email: string, password: string) {
    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();

    const user = await this.usersService.findByEmail(
      normalizedEmail,
    );

    if (!user) {
      throw new UnauthorizedException(
        'Credenciales incorrectas',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password.trim(),
      user.password,
    );

    if (!isPasswordValid) {
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

    return {
      access_token: token,
    };
  }
}
