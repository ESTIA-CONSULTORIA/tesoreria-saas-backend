import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(payload: Record<string, any>) {
    return this.jwtService.sign(payload, {
      expiresIn: '15m',
    });
  }

  generateRefreshToken(payload: Record<string, any>) {
    return this.jwtService.sign(payload, {
      expiresIn: '30d',
    });
  }

  verifyToken(token: string) {
    return this.jwtService.verify(token);
  }
}
