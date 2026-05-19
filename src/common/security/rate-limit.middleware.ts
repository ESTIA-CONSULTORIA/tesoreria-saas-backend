import {
  Injectable,
  Logger,
  NestMiddleware,
  TooManyRequestsException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(
    RateLimitMiddleware.name,
  );

  private readonly requests = new Map<string, {
    count: number;
    timestamp: number;
  }>();

  use(
    request: Request,
    _: Response,
    next: NextFunction,
  ) {
    const ip = request.ip || 'unknown';

    const now = Date.now();

    const windowMs = 60000;
    const limit = 120;

    const current = this.requests.get(ip);

    if (!current || now - current.timestamp > windowMs) {
      this.requests.set(ip, {
        count: 1,
        timestamp: now,
      });

      return next();
    }

    current.count += 1;

    if (current.count > limit) {
      this.logger.warn(`Rate limit exceeded :: ${ip}`);

      throw new TooManyRequestsException(
        'Too many requests',
      );
    }

    next();
  }
}
