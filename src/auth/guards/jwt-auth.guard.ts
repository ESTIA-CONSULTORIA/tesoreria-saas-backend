import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { TokenService } from '../services/token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader = String(
      request.headers.authorization || '',
    ).trim();

    if (!authHeader) {
      throw new UnauthorizedException(
        'Authorization header missing',
      );
    }

    const [scheme, token] = authHeader.split(' ');

    if (String(scheme).toLowerCase() !== 'bearer') {
      throw new UnauthorizedException(
        'Invalid authorization scheme',
      );
    }

    if (!token?.trim()) {
      throw new UnauthorizedException('Token missing');
    }

    try {
      const payload = this.tokenService.verifyToken(
        token.trim(),
      );

      if (!payload || !payload.sub) {
        throw new UnauthorizedException(
          'Invalid token payload',
        );
      }

      request.user = payload;

      return true;
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error
          ? error.message
          : 'Invalid token',
      );
    }
  }
}
