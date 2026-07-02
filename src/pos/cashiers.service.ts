import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CashiersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async loginWithNip(nip: string, tenantId: string) {
    // Find all CAJERO users in the tenant to match NIP against each one
    const where: any = { roleCode: 'CAJERO' };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    const users = await this.usersRepo.find({
      where,
      select: ['id', 'email', 'name', 'password', 'roleCode', 'tenantId'],
    });
    if (!users.length) {
      throw new HttpException('NIP incorrecto', HttpStatus.UNAUTHORIZED);
    }

    // Find the user whose hashed password matches the provided NIP
    let matchedUser: (typeof users)[0] | null = null;
    for (const u of users) {
      const isValid = await bcrypt.compare(nip, u.password);
      if (isValid) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      throw new HttpException('NIP incorrecto', HttpStatus.UNAUTHORIZED);
    }

    const user = matchedUser;

    // Generar token (reutilizar lógica de AuthService)
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roleCode: user.roleCode,
        tenantId: user.tenantId,
      },
      secret,
      { expiresIn: '24h' },
    );

    // Definir módulos para CAJERO
    const modulosActivos = ['pos'];

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleCode: user.roleCode,
        tenantId: user.tenantId,
      },
      modulosActivos,
    };
  }
}
