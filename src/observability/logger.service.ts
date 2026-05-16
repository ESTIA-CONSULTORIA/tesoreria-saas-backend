import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LoggerService {
  private readonly logger = new Logger('ERP');

  info(message: string, metadata?: any) {
    this.logger.log({
      level: 'info',
      message,
      metadata,
    });
  }

  warn(message: string, metadata?: any) {
    this.logger.warn({
      level: 'warn',
      message,
      metadata,
    });
  }

  error(message: string, metadata?: any) {
    this.logger.error({
      level: 'error',
      message,
      metadata,
    });
  }
}
