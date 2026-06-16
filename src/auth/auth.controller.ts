import { Body, Controller, Post, Headers, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: { email: string; password: string }) {
    return this.authService.register(body.email, body.password);
  }

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('switch-company')
  switchCompany(@Body() body: { companyId: string }, @Request() req) {
    const user = req.user;
    return this.authService.switchCompany(user.id, user.tenantId, body.companyId);
  }

  @Public()
  @Post('executive-login')
  executiveLogin(@Body() body: { tenantId: string; pin: string }) {
    return this.authService.executiveLogin(body.tenantId, body.pin);
  }
}