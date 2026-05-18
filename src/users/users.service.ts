import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
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

    return this.usersRepository.save(user);
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
