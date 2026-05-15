import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { SystemEventsService } from './system-events.service';
import { SystemEvent } from './entities/system-event.entity';

@Controller('system-events')
export class SystemEventsController {
  constructor(private systemEventsService: SystemEventsService) {}

  @Post()
  emit(@Body() body: Partial<SystemEvent>) {
    return this.systemEventsService.emit(body);
  }

  @Get('open')
  findOpenEvents() {
    return this.systemEventsService.findOpenEvents();
  }

  @Patch(':id/acknowledge')
  acknowledge(@Param('id') id: string) {
    return this.systemEventsService.acknowledge(id);
  }

  @Patch(':id/close')
  close(@Param('id') id: string) {
    return this.systemEventsService.close(id);
  }
}
