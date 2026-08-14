import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const secret = this.configService.get<string>('JWT_SECRET');

    // Dos fuentes posibles de token, no una con fallback por ausencia: el header sigue
    // vivo para Vista Ejecutiva, Portal Empleado, POS Lite y el NIP del POS completo
    // (ninguno migrado a cookies todavía); la cookie httpOnly es la fuente del ERP normal
    // (login/portal-login/switch-company) desde la migración a cookies. Se intentan ambas
    // y se usa la que verifique — no "header si existe" a secas, porque una pantalla que
    // todavía arme `Authorization: Bearer null` (localStorage vacío tras la migración) no
    // debe bloquear el fallback a la cookie.
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const cookieToken = req.cookies?.access_token || null;

    for (const token of [headerToken, cookieToken]) {
      if (!token) continue;
      try {
        const decoded = this.jwtService.verify(token, { secret });
        req['user'] = {
          id: decoded.sub,
          email: decoded.email,
          roleCode: decoded.roleCode,
          tenantId: decoded.tenantId,
          companyId: decoded.companyId || null,
          branchId: decoded.branchId || null,
          executiveAccess: decoded.executiveAccess === true,
          // Ya vivía en el JWT (generateTokens() lo firma) pero ningún guard lo leía de
          // req.user hasta ahora — se agrega para que GET /auth/me pueda devolver una
          // sesión completa (mismo shape que login) sin depender de nada más.
          modulosActivos: decoded.modulosActivos || [],
        };
        break;
      } catch (error) {
        // Este candidato no verificó — se prueba el siguiente (o se deja sin asignar
        // request.user si ninguno sirve; los guards manejan la autorización).
      }
    }

    next();
  }
}
