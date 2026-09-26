import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantSetting } from './entities/tenant-setting.entity';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantSettingsService, { provide: getRepositoryToken(TenantSetting), useValue: {} }],
    }).compile();

    service = module.get<TenantSettingsService>(TenantSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
