import { Injectable } from '@nestjs/common';

@Injectable()
export class RequestScopeService {
  applyScope<T extends Record<string, any>>(
    query: T,
    request: any,
  ) {
    const tenantId = request.user?.tenantId;
    const companyId = request.user?.companyId;
    const branchId = request.user?.branchId;

    return {
      ...query,
      ...(tenantId ? { tenantId } : {}),
      ...(companyId ? { companyId } : {}),
      ...(branchId ? { branchId } : {}),
    };
  }
}
