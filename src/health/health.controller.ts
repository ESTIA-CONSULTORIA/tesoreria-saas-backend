import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      success: true,
      status: 'healthy',
      services: {
        api: 'online',
        database: 'online',
        redis: 'online',
        websocket: 'online',
      },
      timestamp: new Date(),
    };
  }
}
