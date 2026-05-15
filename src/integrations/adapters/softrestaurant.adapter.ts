import { Injectable } from '@nestjs/common';

import {
  IntegrationAdapter,
  IntegrationAdapterPayload,
  IntegrationAdapterResult,
} from './integration-adapter.interface';

@Injectable()
export class SoftRestaurantAdapter implements IntegrationAdapter {
  supports(provider: string, type: string, connectionMode: string): boolean {
    return (
      provider === 'SOFTRESTAURANT' &&
      ['POS', 'INVENTORY'].includes(type) &&
      ['API', 'SQL', 'CSV', 'EXCEL'].includes(connectionMode)
    );
  }

  async execute(
    payload: IntegrationAdapterPayload,
  ): Promise<IntegrationAdapterResult> {
    // Future implementation:
    // - SoftRestaurant API integration
    // - direct SQL synchronization
    // - CSV/Excel imports
    // - ticket synchronization
    // - cashier cut synchronization
    // - inventory synchronization

    return {
      success: true,
      message: 'SoftRestaurant adapter executed',
      data: payload,
    };
  }
}
