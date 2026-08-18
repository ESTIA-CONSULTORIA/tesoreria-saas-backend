import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Request,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { CashiersService } from './cashiers.service';
import { Public } from '../auth/public.decorator';
import { setPosLiteCookie, clearPosLiteCookie } from '../auth/auth-cookies.util';

@Controller('pos/cashiers')
export class CashiersController {
  constructor(
    private cashiersService: CashiersService,
    private jwtService: JwtService,
  ) {}

  // 5 intentos / 15 min — mismo hueco de fuerza bruta que /auth/login y
  // /auth/executive-login (PIN de 4 dígitos, tenantId descubrible vía
  // /tenants/resolve/:slug, sin esto no había ninguna fricción).
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('nip')
  async loginWithNip(
    @Body() body: { nip: string },
    @Headers('tenant-id') tenantId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, ...rest } = await this.cashiersService.loginWithNip(body.nip, tenantId);
    setPosLiteCookie(res, access_token);
    return rest;
  }

  // Sin cookie de refresh (POS Lite no tiene, sesión de 24h fija) — limpieza puramente de
  // la cookie, no hay nada que revocar en BD.
  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearPosLiteCookie(res);
    return { message: 'Sesión cerrada correctamente' };
  }

  // Bootstrap de sesión para CorteCajaLite.tsx — mismo motivo que GET /auth/executive-me:
  // lee la cookie de POS Lite directo, no pasa por el chain genérico del middleware, para
  // no depender de cuál otra cookie de sesión pueda haber en el mismo navegador.
  @Public()
  @Get('me')
  me(@Request() req) {
    const token = req.cookies?.pos_access_token;
    if (!token) throw new UnauthorizedException('Sesión no encontrada');
    try {
      const decoded: any = this.jwtService.verify(token);
      if (decoded.posLiteAccess !== true) throw new Error('not pos-lite token');
      return {
        user: {
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          roleCode: decoded.roleCode,
          tenantId: decoded.tenantId,
        },
      };
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
  }
}
