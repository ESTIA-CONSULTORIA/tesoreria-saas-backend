import { Injectable } from '@nestjs/common';

@Injectable()
export class CsvIngestionService {
  async ingest(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    provider: string;
    fileName: string;
    rows: any[];
  }) {
    // Future implementation:
    // - validate CSV schema
    // - detect encoding
    // - normalize headers
    // - map rows to canonical model
    // - create sync queue jobs
    // - generate reconciliation records

    return {
      success: true,
      provider: payload.provider,
      fileName: payload.fileName,
      rowsReceived: payload.rows.length,
    };
  }
}
