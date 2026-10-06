import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import * as bcrypt from 'bcrypt';
import { In } from 'typeorm';
import { ROLES_NIP } from '../config/roles-pos.config';

@Injectable()
export class CashiersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
    private jwtService: JwtService,
  ) {}

  // userId opcional: si el cliente indica quién es, el NIP se verifica SOLO contra ese usuario (y el límite
  // de intentos va por tenant + usuario + IP). Sin él, se busca el NIP entre los usuarios de NIP del tenant.
  async loginWithNip(nip: string, tenantId?: string, userId?: string) {
    // Auditoría de seguridad (GoodsHabits): antes no filtraba isActive — un cajero
    // desactivado seguía siendo candidato válido en el loop de bcrypt.compare de abajo,
    // autenticando con normalidad si el NIP seguía siendo el correcto. Se filtra en el
    // where, no después del loop — ni siquiera entra a la comparación.
    // CAJERO, MESERO y CAPITAN (ROLES_NIP). GERENTE y ADMIN no entran por NIP: usan sesión ERP.
    const where: any = { roleCode: In(ROLES_NIP), isActive: true };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    if (userId) {
      where.id = userId;
    }

    const users = await this.usersRepo.find({
      where,
      select: ['id', 'email', 'name', 'password', 'roleCode', 'tenantId', 'companyId', 'branchId'],
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

    // posLiteAccess: true por paridad con executiveAccess (auth.service.ts) — permite que
    // GET /pos/cashiers/me rechace un JWT que verifique pero no haya salido de este flujo.
    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        roleCode: user.roleCode,
        tenantId: user.tenantId,
        // Sucursal y empresa del usuario viajan en el token (firmado por el servidor): sin ellas, una sesión
        // POS Lite no tenía sucursal y GET /pos/areas no podía acotar por sucursal.
        companyId: user.companyId || null,
        branchId: user.branchId || null,
        posLiteAccess: true,
      },
      { expiresIn: '24h' },
    );

    // Definir módulos para CAJERO
    const modulosActivos = ['pos'];

    // Obtener plan del tenant para determinar si es LITE
    const tenant = await this.tenantsRepo.findOne({ where: { id: user.tenantId } });
    const planCode = tenant?.plan || null;

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleCode: user.roleCode,
        tenantId: user.tenantId,
        companyId: user.companyId || null,
        branchId: user.branchId || null,
      },
      modulosActivos,
      planCode,
    };
  }
}
