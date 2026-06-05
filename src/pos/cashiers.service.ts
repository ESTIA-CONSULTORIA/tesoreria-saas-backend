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
    // Buscar usuario con roleCode CAJERO y tenantId
    const user = await this.usersRepo.findOne({
      where: {
        roleCode: 'CAJERO',
        tenantId,
      },
    });

    if (!user) {
      throw new HttpException('NIP incorrecto', HttpStatus.UNAUTHORIZED);
    }

    // Verificar NIP contra password hasheado
    const isNipValid = await bcrypt.compare(nip, user.password);
    if (!isNipValid) {
      throw new HttpException('NIP incorrecto', HttpStatus.UNAUTHORIZED);
    }

    // Generar token (reutilizar lógica de AuthService)
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign(
      {
        id: user.id,
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
