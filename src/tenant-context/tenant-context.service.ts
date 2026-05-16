import { Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantContextService {
  getContextFromHeaders(headers: Record<string, any>) {
    const tenantId = headers['tenant-id'];
    const companyId = headers['company-id'];
    const branchId = headers['branch-id'];
    const userId = headers['user-id'];

    if (!tenantId) {
      throw new ForbiddenException('Tenant no identificado');
    }

    return {
      tenantId: String(tenantId),
      companyId: companyId ? String(companyId) : null,
      branchId: branchId ? String(branchId) : null,
      userId: userId ? String(userId) : null,
    };
  }
}
