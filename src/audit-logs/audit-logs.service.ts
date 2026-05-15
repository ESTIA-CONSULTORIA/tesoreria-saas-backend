import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  create(data: Partial<AuditLog>) {
    const log = this.auditLogRepository.create(data);
    return this.auditLogRepository.save(log);
  }

  findRecent(limit = 100) {
    return this.auditLogRepository.find({
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  findByModule(module: string) {
    return this.auditLogRepository.find({
      where: {
        module,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }
}
