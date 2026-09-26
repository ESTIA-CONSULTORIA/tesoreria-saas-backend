import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { HrService } from '../hr/hr.service';
import { TenantsService } from '../tenants/tenants.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { TenantModule } from '../modules/entities/tenant-module.entity';

// Diagnóstico (ronda de seguimiento, auditoría BUSINESS): boilerplate de `nest generate` sin
// llenar — declaraba solo el service, sin ninguna de sus 8 dependencias reales (4 services +
// JwtService + 3 repositorios), así que compile() nunca lograba resolver el constructor.
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: HrService, useValue: {} },
        { provide: TenantsService, useValue: {} },
        { provide: getRepositoryToken(RefreshToken), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(TenantModule), useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
