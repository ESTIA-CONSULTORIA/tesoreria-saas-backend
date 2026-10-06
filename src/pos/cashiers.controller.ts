import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  Res,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { CashiersService } from './cashiers.service';
import { NipThrottleService } from './nip-throttle.service';
import { Public } from '../auth/public.decorator';
import { setPosLiteCookie, clearPosLiteCookie } from '../auth/auth-cookies.util';

@Controller('pos/cashiers')
export class CashiersController {
  constructor(
    private cashiersService: CashiersService,
    private jwtService: JwtService,
    private nipThrottle: NipThrottleService,
  ) {}

  // 5 intentos / 15 min — mismo hueco de fuerza bruta que /auth/login y
  // /auth/executive-login (PIN de 4 dígitos, tenantId descubrible vía
  // /tenants/resolve/:slug, sin esto no había ninguna fricción).
  //
  // Auditoría de seguridad (GoodsHabits, diagnóstico sesión POS): antes leía
  // @Headers('tenant-id') — ningún caller real lo mandaba así. POSPage.tsx no mandaba
  // tenantId en absoluto (ni header ni body); CorteCajaLite.tsx lo mandaba en el body, no
  // en el header. Con tenantId siempre undefined, loginWithNip() buscaba el NIP entre
  // TODOS los CAJERO de TODOS los tenants — confirmado con curl real: un NIP sin contexto
  // de tenant autenticó al cajero de un tenant que no era el que se estaba probando.
  //
  // Fix: prioriza req.user?.tenantId — @Public() no bloquea que jwt.middleware.ts decodifique
  // igual una cookie de sesión ya válida si viene en la request (POSPage.tsx: el ADMIN/GERENTE
  // que abre el POS ya tiene access_token puesto antes de entrar el NIP, mismo patrón de
  // resolución de tenantId que el resto de los controllers ya auditados — server-verificado,
  // no lo puede falsificar el cliente). body.tenantId queda como fallback SOLO para el caso
  // sin sesión previa (CorteCajaLite.tsx / POS Lite: la primera vez que se entra un NIP no
  // hay ninguna cookie todavía, el tenant se resuelve antes por slug, sin autenticar) — ya lo
  // manda en el body hoy, así que no hace falta tocar ese frontend.
  @Public()
  // El límite real de fallos (por tenant+IP, tenant y tenant+usuario+IP) lo lleva NipThrottleService; este
  // @Throttle solo frena una inundación de peticiones por IP (antes: 5 / 15 min, que bloqueaba a todas las
  // tabletas de un local detrás de la misma IP).
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('nip')
  async loginWithNip(
    @Body() body: { nip: string; tenantId?: string; userId?: string },
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tenantId = req?.user?.tenantId || body.tenantId;
    // Detrás del proxy de Railway req.ip es la IP del proxy: se prefiere el primer valor de x-forwarded-for.
    // Es falsificable, por eso el tope por tenant (todas las IPs) es el que frena la fuerza bruta distribuida.
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req?.ip || 'desconocida';
    const userId = typeof body.userId === 'string' && body.userId ? body.userId : undefined;

    this.nipThrottle.assertAllowed(tenantId, userId, ip);
    let result;
    try {
      result = await this.cashiersService.loginWithNip(body.nip, tenantId, userId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.UNAUTHORIZED) {
        this.nipThrottle.registerFailure(tenantId, userId, ip);
      }
      throw error;
    }
    this.nipThrottle.registerSuccess(tenantId, userId, ip);
    const { access_token, ...rest } = result;
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
