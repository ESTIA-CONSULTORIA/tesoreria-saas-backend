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
    console.log('loginWithNip - nip:', nip);
    console.log('loginWithNip - tenantId:', tenantId);

    // Buscar usuario con roleCode CAJERO
    // Si tenantId es null o vacío, buscar solo por roleCode
    const where: any = { roleCode: 'CAJERO' };
    if (tenantId) {
      where.tenantId = tenantId;
    }

    console.log('loginWithNip - where:', where);
    const user = await this.usersRepo.findOne({ where });

    console.log('loginWithNip - user found:', !!user);
    if (user) {
      console.log('loginWithNip - user.email:', user.email);
      console.log('loginWithNip - user.roleCode:', user.roleCode);
      console.log('loginWithNip - user.tenantId:', user.tenantId);
    }

    if (!user) {
      throw new HttpException('NIP incorrecto', HttpStatus.UNAUTHORIZED);
    }

    // Verificar NIP contra password hasheado
    const isNipValid = await bcrypt.compare(nip, user.password);
    console.log('loginWithNip - isNipValid:', isNipValid);

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
