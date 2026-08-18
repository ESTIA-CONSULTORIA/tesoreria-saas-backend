import { Body, Controller, Get, Post, Headers, Request, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { setAuthCookies, clearAuthCookies } from './auth-cookies.util';

// 5 intentos / 15 min en los endpoints de login por contraseña/PIN — sin esto, no había
// ningún límite de fuerza bruta en todo el backend (diagnóstico de la auditoría de
// Vista Ejecutiva). blockDuration no se especifica a propósito: cae por default al
// mismo valor de ttl (verificado en el código fuente de @nestjs/throttler 6.5.0).
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 900_000 } };

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: { email: string; password: string }) {
    return this.authService.register(body.email, body.password);
  }

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

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('executive-login')
  executiveLogin(@Body() body: { tenantId: string; pin: string }) {
    return this.authService.executiveLogin(body.tenantId, body.pin);
  }

  @Public()
  @Post('refresh')
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const { access_token, refresh_token } = await this.authService.refreshAccessToken(refreshToken);
    setAuthCookies(res, access_token, refresh_token);
    return { success: true };
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