import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SystemEvent } from './entities/system-event.entity';
import { SystemEventsService } from './system-events.service';
import { SystemEventsController } from './system-events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemEvent])],
  providers: [SystemEventsService],
  controllers: [SystemEventsController],
  exports: [SystemEventsService],
})
export class SystemEventsModule {}
