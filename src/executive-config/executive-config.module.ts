import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecutiveConfig } from './entities/executive-config.entity';
import { ExecutiveConfigService } from './executive-config.service';
import { ExecutiveConfigController } from './executive-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExecutiveConfig])],
  controllers: [ExecutiveConfigController],
  providers: [ExecutiveConfigService],
  exports: [ExecutiveConfigService],
})
export class ExecutiveConfigModule {}
