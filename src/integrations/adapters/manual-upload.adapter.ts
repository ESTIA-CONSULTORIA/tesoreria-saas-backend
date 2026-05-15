import { Injectable } from '@nestjs/common';

import {
  IntegrationAdapter,
  IntegrationAdapterPayload,
  IntegrationAdapterResult,
} from './integration-adapter.interface';

@Injectable()
export class ManualUploadAdapter implements IntegrationAdapter {
  supports(provider: string, type: string, connectionMode: string): boolean {
    return ['CSV', 'EXCEL', 'MANUAL_UPLOAD'].includes(connectionMode);
  }

  async execute(
    payload: IntegrationAdapterPayload,
  ): Promise<IntegrationAdapterResult> {
    // Future implementation:
    // - CSV parser
    // - Excel parser
    // - validation layer
    // - duplicate detection
    // - import mapping engine

    return {
      success: true,
      message: 'Manual upload adapter executed',
      data: payload,
    };
  }
}
