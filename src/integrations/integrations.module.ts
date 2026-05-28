import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { Integration } from './entities/integration.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Integration])],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}