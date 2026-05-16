import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from '../auth.service';

@Controller('auth')
export class AuthApiController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body()
    payload: {
      email: string;
      password: string;
    },
  ) {
    return this.authService.login(payload);
  }

  @Post('refresh')
  async refresh(
    @Body()
    payload: {
      refreshToken: string;
    },
  ) {
    return this.authService.refresh(payload.refreshToken);
  }
}
