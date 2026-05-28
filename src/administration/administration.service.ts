import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction, AuditModule } from './entities/audit-log.entity';
import { Tenant } from '../tenants/entities/tenant.entity';

@Injectable()
export class AdministrationService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
  ) {}

  async createAuditLog(data: {
    userId: string;
    userName?: string;
    userEmail?: string;
    action: AuditAction;
    module: AuditModule;
    entityId?: string;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const auditLog = this.auditLogRepo.create(data);
    return this.auditLogRepo.save(auditLog);
  }

  async getAuditLogs(filters?: {
    userId?: string;
    module?: AuditModule;
    action?: AuditAction;
    startDate?: string;
    endDate?: string;
  }) {
    const query = this.auditLogRepo.createQueryBuilder('auditLog');

    if (filters?.userId) {
      query.andWhere('auditLog.userId = :userId', { userId: filters.userId });
    }
    if (filters?.module) {
      query.andWhere('auditLog.module = :module', { module: filters.module });
    }
    if (filters?.action) {
      query.andWhere('auditLog.action = :action', { action: filters.action });
    }
    if (filters?.startDate) {
      query.andWhere('auditLog.createdAt >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      query.andWhere('auditLog.createdAt <= :endDate', { endDate: `${filters.endDate} 23:59:59` });
    }

    return query.orderBy('auditLog.createdAt', 'DESC').getMany();
  }

  async getTenants() {
    return this.tenantsRepo.find({ order: { tradeName: 'ASC' } });
  }

  async getTenant(id: string) {
    return this.tenantsRepo.findOne({ where: { id } });
  }

  async updateTenant(id: string, data: { legalName?: string; tradeName?: string; isActive?: boolean }) {
    await this.tenantsRepo.update(id, data);
    return this.tenantsRepo.findOne({ where: { id } });
  }

  async getActiveSessions() {
    // Simulación de sesiones activas - en un sistema real esto se conectaría a Redis o similar
    const logs = await this.auditLogRepo
      .createQueryBuilder('auditLog')
      .where('auditLog.action = :action', { action: AuditAction.LOGIN })
      .orderBy('auditLog.createdAt', 'DESC')
      .limit(20)
      .getMany();

    return logs.map((log) => ({
      userId: log.userId,
      userName: log.userName,
      userEmail: log.userEmail,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      loginTime: log.createdAt,
    }));
  }

  async getSystemConfig() {
    // Configuración global del sistema - en un sistema real esto podría estar en una tabla de configuración
    return {
      maintenanceMode: false,
      maxUsersPerTenant: 100,
      defaultRole: 'VIEWER',
      sessionTimeout: 3600,
      allowedOrigins: ['http://localhost:5173'],
    };
  }

  async updateSystemConfig(data: {
    maintenanceMode?: boolean;
    maxUsersPerTenant?: number;
    defaultRole?: string;
    sessionTimeout?: number;
    allowedOrigins?: string[];
  }) {
    // En un sistema real esto actualizaría la tabla de configuración
    return { ...data, updatedAt: new Date() };
  }
}
