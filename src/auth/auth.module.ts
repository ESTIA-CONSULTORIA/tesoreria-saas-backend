import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthSessionService } from './services/auth-session.service';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    UsersModule,
    ConfigModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const jwtSecret = config.get<string>('JWT_SECRET');

        const isProduction =
          config.get<string>('NODE_ENV') ===
          'production';

        if (isProduction && !jwtSecret) {
          throw new Error(
            'JWT_SECRET es requerido en producción',
          );
        }

        return {
          secret:
            jwtSecret || 'development-secret-local',
          signOptions: {
            expiresIn:
              config.get<string>('JWT_EXPIRES_IN') ||
              '1d',
          },
        };
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    TokenService,
    AuthSessionService,
    JwtAuthGuard,
  ],

  exports: [
    AuthService,
    TokenService,
    AuthSessionService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
