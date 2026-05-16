import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  async check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        api: 'ok',
        database: 'pending_check',
        redis: 'pending_check',
        queues: 'pending_check',
        websocket: 'pending_check',
      },
    };
  }
}
