import { Injectable } from '@nestjs/common';

@Injectable()
export class InventoryMovementService {
  async registerSaleConsumption(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    saleId: string;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
  }) {
    // Future implementation:
    // - validate stock
    // - consume inventory
    // - perpetual inventory update
    // - recipe consumption
    // - cost layer update

    return {
      success: true,
      movementType: 'SALE_CONSUMPTION',
      saleId: payload.saleId,
    };
  }
}
