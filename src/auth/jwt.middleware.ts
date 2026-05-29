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
    const authHeader = req.headers['authorization'];
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const secret = this.configService.get<string>('JWT_SECRET');
        const decoded = this.jwtService.verify(token, { secret });
        
        // Asignar el usuario decodificado a request.user
        req['user'] = {
          id: decoded.sub,
          email: decoded.email,
          rol: decoded.roleCode, // Mapear roleCode a rol para consistencia con guards
          roleCode: decoded.roleCode,
        };
      } catch (error) {
        // Si el token es inválido, no asignar usuario
        // Los guards manejarán la autorización
      }
    }
    
    next();
  }
}
