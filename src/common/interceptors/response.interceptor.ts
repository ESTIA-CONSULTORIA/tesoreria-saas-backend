import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor
  implements NestInterceptor
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest();

    const requestId = String(
      request['requestId'] || 'unknown',
    );

    return next.handle().pipe(
      map((data) => ({
        success: true,
        requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        data,
      })),
    );
  }
}
