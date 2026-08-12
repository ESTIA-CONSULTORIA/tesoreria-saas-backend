import { Body, Controller, Post, Headers, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

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
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('portal-login')
  portalLogin(@Body() body: { email: string; password: string }) {
    return this.authService.portalLogin(body.email, body.password);
  }

  @Post('switch-company')
  switchCompany(@Body() body: { companyId: string }, @Request() req) {
    const user = req.user;
    return this.authService.switchCompany(user.id, user.tenantId, body.companyId);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('executive-login')
  executiveLogin(@Body() body: { tenantId: string; pin: string }) {
    return this.authService.executiveLogin(body.tenantId, body.pin);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshAccessToken(body.refreshToken);
  }

  @Post('logout')
  logout(@Body() body: { refreshToken: string }) {
    return this.authService.revokeRefreshToken(body.refreshToken);
  }
}