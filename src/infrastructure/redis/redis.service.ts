import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    RedisService.name,
  );

  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis conectado');
    });

    this.client.on('error', (error) => {
      this.logger.error(
        'Redis error',
        error?.stack,
      );
    });

    this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();

      this.logger.warn('Redis desconectado');
    }
  }

  getClient() {
    return this.client;
  }
}
