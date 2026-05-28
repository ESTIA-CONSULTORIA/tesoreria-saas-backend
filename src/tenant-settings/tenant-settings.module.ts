import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantSetting } from './entities/tenant-setting.entity';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantSetting])],
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}
