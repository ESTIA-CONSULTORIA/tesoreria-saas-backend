import { Injectable } from '@nestjs/common';

import {
  IntegrationAdapter,
  IntegrationAdapterPayload,
  IntegrationAdapterResult,
} from './integration-adapter.interface';

@Injectable()
export class SierraAdapter implements IntegrationAdapter {
  supports(provider: string, type: string, connectionMode: string): boolean {
    return (
      provider === 'SIERRA' &&
      ['POS', 'INVENTORY'].includes(type) &&
      ['API', 'SQL', 'CSV', 'EXCEL'].includes(connectionMode)
    );
  }

  async execute(
    payload: IntegrationAdapterPayload,
  ): Promise<IntegrationAdapterResult> {
    // Future implementation:
    // - Sierra POS synchronization
    // - inventory synchronization
    // - ticket imports
    // - warehouse movement synchronization

    return {
      success: true,
      message: 'Sierra adapter executed',
      data: payload,
    };
  }
}
