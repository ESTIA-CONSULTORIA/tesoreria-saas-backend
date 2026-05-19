import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RequestTimeInterceptor
  implements NestInterceptor
{
  private readonly logger = new Logger(
    RequestTimeInterceptor.name,
  );

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest();

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startedAt;

        this.logger.log(
          `${request.method} ${request.url} :: ${duration}ms`,
        );
      }),
    );
  }
}
