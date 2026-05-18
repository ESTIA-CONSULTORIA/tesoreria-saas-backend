import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(
    UsersService.name,
  );

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(
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

    if (!normalizedEmail) {
      throw new BadRequestException(
        'Email requerido',
      );
    }

    if (!password?.trim()) {
      throw new BadRequestException(
        'Password requerido',
      );
    }

    if (!allowedRoles.includes(normalizedRole)) {
      throw new BadRequestException(
        'Rol inválido',
      );
    }

    const existingUser = await this.usersRepository.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      throw new BadRequestException(
        'Usuario ya existe',
      );
    }

    const user = this.usersRepository.create({
      email: normalizedEmail,
      password,
      tenantId: tenantId?.trim(),
      role: normalizedRole,
    });

    const savedUser = await this.usersRepository.save(user);

    this.logger.log(
      `Usuario creado: ${normalizedEmail}`,
    );

    return savedUser;
  }

  findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: {
        email: String(email || '')
          .trim()
          .toLowerCase(),
      },
    });
  }
}
