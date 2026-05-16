import { Injectable } from '@nestjs/common';

import { TokenService } from './token.service';

@Injectable()
export class AuthSessionService {
  constructor(private readonly tokenService: TokenService) {}

  async login(payload: {
    email: string;
    password: string;
  }) {
    // Future implementation:
    // - validate credentials
    // - load permissions
    // - create session record

    const user = {
      id: 'demo-user',
      tenantId: 'demo-tenant',
      companyId: 'demo-company',
      branchId: 'demo-branch',
      email: payload.email,
      role: 'ADMIN',
    };

    const accessToken = this.tokenService.generateAccessToken(user);
    const refreshToken = this.tokenService.generateRefreshToken(user);

    return {
      success: true,
      accessToken,
      refreshToken,
      user,
    };
  }

  async refresh(refreshToken: string) {
    const payload = this.tokenService.verifyToken(refreshToken);

    const accessToken = this.tokenService.generateAccessToken(payload);

    return {
      success: true,
      accessToken,
    };
  }
}
