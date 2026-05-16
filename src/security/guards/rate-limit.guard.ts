import {
  CanActivate,
  ExecutionContext,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly requests = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const ip = request.ip || 'unknown';
    const now = Date.now();

    const windowMs = 60 * 1000;
    const maxRequests = 100;

    const timestamps = this.requests.get(ip) || [];

    const filtered = timestamps.filter(
      (timestamp) => now - timestamp < windowMs,
    );

    if (filtered.length >= maxRequests) {
      throw new TooManyRequestsException('Rate limit exceeded');
    }

    filtered.push(now);

    this.requests.set(ip, filtered);

    return true;
  }
}
