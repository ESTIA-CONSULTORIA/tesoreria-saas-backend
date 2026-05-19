import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(
    AuditService.name,
  );

  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  async log(data: Partial<AuditLog>) {
    const auditLog = this.auditRepository.create({
      ...data,
    });

    const savedLog = await this.auditRepository.save(auditLog);

    this.logger.log(
      `Audit log creado: ${savedLog.id}`,
    );

    return savedLog;
  }
}
