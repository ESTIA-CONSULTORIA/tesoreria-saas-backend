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
    roleCode?: string;
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
    page?: number;
    limit?: number;
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

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async exportToCSV(filters?: {
    userId?: string;
    tenantId?: string;
    action?: string;
    entity?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const result = await this.findAll({ ...filters, limit: 10000 });
    const logs = result.data;

    const headers = ['ID', 'Usuario', 'Email', 'Rol', 'Tenant', 'Acción', 'Entidad', 'IP', 'User Agent', 'Fecha'];
    const rows = logs.map(log => [
      log.id,
      log.userId,
      log.userEmail,
      log.roleCode || '',
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
