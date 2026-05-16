import { Injectable } from '@nestjs/common';

@Injectable()
export class CanonicalMappingService {
  async mapSale(payload: {
    provider: string;
    data: any;
  }) {
    // Future implementation:
    // - provider-specific mapping
    // - taxes normalization
    // - product mapping
    // - branch mapping
    // - currency normalization

    return {
      success: true,
      canonicalType: 'SALE',
      provider: payload.provider,
      normalized: {
        sourceProvider: payload.provider,
        saleData: payload.data,
      },
    };
  }
}
