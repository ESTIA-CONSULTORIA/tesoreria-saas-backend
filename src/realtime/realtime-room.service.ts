import { Injectable } from '@nestjs/common';

@Injectable()
export class RealtimeRoomService {
  buildTenantRoom(tenantId: string) {
    return `tenant:${tenantId}`;
  }

  buildCompanyRoom(tenantId: string, companyId: string) {
    return `tenant:${tenantId}:company:${companyId}`;
  }

  buildBranchRoom(tenantId: string, companyId: string, branchId: string) {
    return `tenant:${tenantId}:company:${companyId}:branch:${branchId}`;
  }

  buildModuleRoom(tenantId: string, module: string) {
    return `tenant:${tenantId}:module:${module}`;
  }
}
