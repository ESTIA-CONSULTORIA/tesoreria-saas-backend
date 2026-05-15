export interface IntegrationAdapterResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface IntegrationAdapterPayload {
  tenantId: string;
  companyId: string;
  branchId?: string;
  provider: string;
  type: string;
  connectionMode: string;
  operation: string;
  payload: unknown;
}

export interface IntegrationAdapter {
  supports(provider: string, type: string, connectionMode: string): boolean;
  execute(payload: IntegrationAdapterPayload): Promise<IntegrationAdapterResult>;
}
