import { Test, TestingModule } from '@nestjs/testing';
import { TenantSettingsController } from './tenant-settings.controller';

describe('TenantSettingsController', () => {
  let controller: TenantSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantSettingsController],
    }).compile();

    controller = module.get<TenantSettingsController>(TenantSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
