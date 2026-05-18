import {
  Injectable,
  Logger,
  NestMiddleware,
} from '@nestjs/common';
import {
  NextFunction,
  Request,
  Response,
} from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestContextMiddleware
  implements NestMiddleware
{
  private readonly logger = new Logger(
    RequestContextMiddleware.name,
  );

  use(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const requestId =
      String(req.headers['x-request-id'] || '').trim() ||
      randomUUID();

    req['requestId'] = requestId;

    res.setHeader('x-request-id', requestId);

    this.logger.log(
      `${req.method} ${req.originalUrl} :: ${requestId}`,
    );

    next();
  }
}
