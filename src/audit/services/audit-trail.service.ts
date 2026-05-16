import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditTrailService {
  async register(payload: {
    tenantId: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: any;
  }) {
    // Future implementation:
    // - persist audit event
    // - IP tracking
    // - device tracking
    // - rollback support

    return {
      success: true,
      action: payload.action,
      entityType: payload.entityType,
    };
  }
}
