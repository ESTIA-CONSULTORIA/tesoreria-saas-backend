import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantScopeService {
  applyScope<T extends Record<string, any>>(
    query: T,
    context: {
      tenantId: string;
      companyId?: string | null;
      branchId?: string | null;
    },
  ) {
    return {
      ...query,
      tenantId: context.tenantId,
      ...(context.companyId
        ? { companyId: context.companyId }
        : {}),
      ...(context.branchId
        ? { branchId: context.branchId }
        : {}),
    };
  }
}
