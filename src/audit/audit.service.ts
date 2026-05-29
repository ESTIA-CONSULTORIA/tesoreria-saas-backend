import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async createLog(data: {
    userId: string;
    userEmail: string;
    tenantId: string;
    action: string;
    entity: string;
    details?: any;
    ipAddress: string;
    userAgent: string;
  }) {
    const log = this.auditLogRepository.create(data);
    return this.auditLogRepository.save(log);
  }

  async findAll(filters?: {
    userId?: string;
    tenantId?: string;
    action?: string;
    entity?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const queryBuilder = this.auditLogRepository.createQueryBuilder('audit');

    if (filters?.userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    if (filters?.tenantId) {
      queryBuilder.andWhere('audit.tenantId = :tenantId', { tenantId: filters.tenantId });
    }

    if (filters?.action) {
      queryBuilder.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters?.entity) {
      queryBuilder.andWhere('audit.entity = :entity', { entity: filters.entity });
    }

    if (filters?.startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', { endDate: filters.endDate });
    }

    queryBuilder.orderBy('audit.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  async exportToCSV(filters?: {
    userId?: string;
    tenantId?: string;
    action?: string;
    entity?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const logs = await this.findAll(filters);

    const headers = ['ID', 'Usuario', 'Email', 'Tenant', 'Acción', 'Entidad', 'IP', 'User Agent', 'Fecha'];
    const rows = logs.map(log => [
      log.id,
      log.userId,
      log.userEmail,
      log.tenantId,
      log.action,
      log.entity,
      log.ipAddress,
      log.userAgent,
      log.createdAt.toISOString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    return csvContent;
  }
}
