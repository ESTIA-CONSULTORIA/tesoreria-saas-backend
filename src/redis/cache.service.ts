import { Injectable } from '@nestjs/common';

import { RedisClientService } from './redis-client.service';

@Injectable()
export class CacheService {
  constructor(
    private readonly redisClientService: RedisClientService,
  ) {}

  async remember<T>(
    key: string,
    callback: () => Promise<T>,
    ttlSeconds = 60,
  ): Promise<T> {
    const cached = await this.redisClientService.get(key);

    if (cached) {
      return JSON.parse(cached);
    }

    const result = await callback();

    await this.redisClientService.set(
      key,
      JSON.stringify(result),
      ttlSeconds,
    );

    return result;
  }
}
