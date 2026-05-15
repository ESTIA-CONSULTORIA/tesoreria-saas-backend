import { Injectable } from '@nestjs/common';

import { MappingResult } from './mapping-result.interface';

@Injectable()
export class InventoryMapperService {
  mapSoftRestaurantInventory(payload: any): MappingResult {
    try {
      const mapped = {
        externalId: payload.productId,
        sku: payload.sku,
        name: payload.name,
        stock: Number(payload.stock || 0),
        unitCost: Number(payload.unitCost || 0),
        category: payload.category,
      };

      return {
        success: true,
        sourceProvider: 'SOFTRESTAURANT',
        targetType: 'INVENTORY_ITEM',
        data: mapped,
      };
    } catch (error) {
      return {
        success: false,
        sourceProvider: 'SOFTRESTAURANT',
        targetType: 'INVENTORY_ITEM',
        errors: [
          error instanceof Error
            ? error.message
            : 'Unknown mapping error',
        ],
      };
    }
  }
}
