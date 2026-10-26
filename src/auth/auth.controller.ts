import { Body, Controller, Get, Post, Put, Headers, Request, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { NipThrottleService } from '../pos/nip-throttle.service';
import { Public } from './public.decorator';
import {
  setAuthCookies,
  clearAuthCookies,
  setExecutiveCookie,
  clearExecutiveCookie,
} from './auth-cookies.util';

// 5 intentos / 15 min en los endpoints de login por contraseña/PIN — sin esto, no había
// ningún límite de fuerza bruta en todo el backend (diagnóstico de la auditoría de
// Vista Ejecutiva). blockDuration no se especifica a propósito: cae por default al
// mismo valor de ttl (verificado en el código fuente de @nestjs/throttler 6.5.0).
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 900_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
    private nipThrottle: NipThrottleService,
  ) {}

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, refresh_token, user, modulosActivos } = await this.authService.login(
      body.email,
      body.password,
    );
    setAuthCookies(res, access_token, refresh_token);
    return { user, modulosActivos };
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('portal-login')
  async portalLogin(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { access_token, refresh_token, user, modulosActivos } = await this.authService.portalLogin(
      body.email,
      body.password,
    );
    setAuthCookies(res, access_token, refresh_token);
    return { user, modulosActivos };
  }

  // Exclusivo para cuentas de servicio server-to-server (ej. DeliveryHub Pro) — sin
  // sesión de navegador, las cookies httpOnly no tienen sentido para este cliente.
  // Devuelve los tokens en el body en vez de setearlos como cookies; el gate de
  // roleCode/tenantId vive en authService.serviceLogin().
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('service-login')
  async serviceLogin(@Body() body: { email: string; password: string }) {
    return this.authService.serviceLogin(body.email, body.password);
  }

  @Post('switch-company')
  async switchCompany(
    @Body() body: { companyId: string },
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reqUser = req.user;
    const { access_token, refresh_token, user } = await this.authService.switchCompany(
      reqUser.id,
      reqUser.tenantId,
      body.companyId,
    );
    setAuthCookies(res, access_token, refresh_token);
    return { user };
  }

  @Get('me')
  me(@Request() req) {
    return req.user;
  }

  // Preferencia de interfaz propia (skin). Cualquier usuario con sesión; el id es el de la sesión, así que nadie toca la de otro.
  @Put('me/ui-prefs')
  guardarUiPrefs(@Request() req, @Body() body: unknown) {
    return this.authService.guardarUiPrefs(req.user.id, req.user.roleCode, body);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('executive-login')
  async executiveLogin(
    @Body() body: { tenantId: string; pin: string },
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Límite de fallos por tenant (además del @Throttle por IP, que detrás del proxy de Railway puede ser una sola IP para todos).
    // Llaves propias (prefijo exec:) para no mezclarse con el NIP del POS. Solo cuentan los 401; un acierto limpia la IP.
    const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = forwarded || req?.ip || 'desconocida';
    const ns = `exec:${body?.tenantId ?? ''}`;
    this.nipThrottle.assertAllowed(ns, undefined, ip);
    let resultado;
    try {
      resultado = await this.authService.executiveLogin(body.tenantId, body.pin);
    } catch (e) {
      if (e instanceof UnauthorizedException) this.nipThrottle.registerFailure(ns, undefined, ip);
      throw e;
    }
    this.nipThrottle.registerSuccess(ns, undefined, ip);
    const { access_token, user } = resultado;
    setExecutiveCookie(res, access_token);
    return { user };
  }

  // Sin cookie de refresh (Vista Ejecutiva no tiene, sesión de 8h fija) — limpieza
  // puramente de la cookie, no hay nada que revocar en BD.
  @Public()
  @Post('executive-logout')
  executiveLogout(@Res({ passthrough: true }) res: Response) {
    clearExecutiveCookie(res);
    return { message: 'Sesión cerrada correctamente' };
  }

  // Bootstrap de sesión para ExecutivePage.tsx (ya no hay token legible en JS para
  // decidir esto del lado del cliente). Lee la cookie de Vista Ejecutiva directo, no pasa
  // por el chain genérico del middleware — evita la ambigüedad de "cuál cookie es esta
  // request" cuando el mismo navegador también tiene una sesión del ERP normal abierta.
  // name ya viaja en el payload firmado (auth.service.ts) así que esto es solo verificar
  // el JWT, sin ir a la base de datos — mismo espíritu de "sesión de 8h fija, sin
  // mecanismo de renovación" que ya tenía executiveLogin.
  @Public()
  @Get('executive-me')
  executiveMe(@Request() req) {
    const token = req.cookies?.exec_access_token;
    if (!token) throw new UnauthorizedException('Sesión no encontrada');
    try {
      const decoded: any = this.jwtService.verify(token);
      if (decoded.executiveAccess !== true) throw new Error('not executive token');
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

  @Public()
  @Post('refresh')
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const { access_token, refresh_token, uiPrefs } = await this.authService.refreshAccessToken(refreshToken);
    setAuthCookies(res, access_token, refresh_token);
    return { success: true, uiPrefs };
  }

  // Contraparte de service-login: renueva el access_token de una cuenta de servicio
  // leyendo el refresh_token del body en vez de una cookie. Sin throttle, igual que
  // /auth/refresh — el token es aleatorio de 128 hex, no una contraseña adivinable.
  @Public()
  @Post('service-refresh')
  async serviceRefresh(@Body() body: { refresh_token: string }) {
    if (!body?.refresh_token) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const { access_token, refresh_token } = await this.authService.serviceRefreshAccessToken(
      body.refresh_token,
    );
    return { access_token, refresh_token };
  }

  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    return { message: 'Sesión cerrada correctamente' };
  }
}