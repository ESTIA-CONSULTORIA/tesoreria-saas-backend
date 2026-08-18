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

    // Vista Ejecutiva y POS Lite ya migraron a cookies httpOnly propias
    // (exec_access_token / pos_access_token, nombres distintos del ERP normal a propósito
    // — ver auth-cookies.util.ts). El header x-session-scope, que execApi.ts y el wrapper
    // de axios de CorteCajaLite.tsx mandan siempre, le dice a este middleware CUÁL cookie
    // es relevante para esta request — sin esto, si el mismo navegador tiene abierta una
    // sesión del ERP normal Y una de Vista Ejecutiva a la vez (mismo dominio, mismo cookie
    // jar, ambas cookies viajan en cada request), no hay forma de saber cuál identidad usar
    // en un endpoint compartido (ej. /pos/shifts, /tenants/:id) — probar "la primera que
    // verifique" en un orden fijo serviría datos de la sesión equivocada en silencio, no un
    // error ruidoso. Con el scope explícito, se valida SOLO la cookie que le corresponde;
    // si no está o no verifica, es 401, no un fallback a otra identidad.
    const scope = req.headers['x-session-scope'];
    let candidates: (string | null)[];
    if (scope === 'executive') {
      candidates = [req.cookies?.exec_access_token || null];
    } else if (scope === 'pos-lite') {
      candidates = [req.cookies?.pos_access_token || null];
    } else {
      // Sin cambios respecto a antes de esta migración: el header sigue vivo para lo que
      // no haya migrado (Portal Empleado todavía manda uno viejo en algunos casos — ver
      // employeeApi.ts — y el NIP del POS completo); la cookie httpOnly es la fuente del
      // ERP normal. Se intentan ambas y se usa la que verifique.
      const authHeader = req.headers['authorization'];
      const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const cookieToken = req.cookies?.access_token || null;
      candidates = [headerToken, cookieToken];
    }

    for (const token of candidates) {
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
          posLiteAccess: decoded.posLiteAccess === true,
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
