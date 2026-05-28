import { Test, TestingModule } from '@nestjs/testing';
import { TenantSettingsService } from './tenant-settings.service';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantSettingsService],
    }).compile();

    service = module.get<TenantSettingsService>(TenantSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
