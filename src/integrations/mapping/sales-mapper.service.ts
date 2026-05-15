import { Injectable } from '@nestjs/common';

import { MappingResult } from './mapping-result.interface';

@Injectable()
export class SalesMapperService {
  mapSoftRestaurantTicket(payload: any): MappingResult {
    try {
      const mapped = {
        externalId: payload.ticketId,
        saleDate: payload.date,
        cashier: payload.cashier,
        total: Number(payload.total || 0),
        subtotal: Number(payload.subtotal || 0),
        taxes: Number(payload.taxes || 0),
        discounts: Number(payload.discounts || 0),
        paymentMethod: payload.paymentMethod,
        items: payload.items || [],
      };

      return {
        success: true,
        sourceProvider: 'SOFTRESTAURANT',
        targetType: 'SALE',
        data: mapped,
      };
    } catch (error) {
      return {
        success: false,
        sourceProvider: 'SOFTRESTAURANT',
        targetType: 'SALE',
        errors: [
          error instanceof Error
            ? error.message
            : 'Unknown mapping error',
        ],
      };
    }
  }

  mapCsvSale(payload: any): MappingResult {
    try {
      const mapped = {
        externalId: payload.id,
        saleDate: payload.sale_date,
        total: Number(payload.total || 0),
        items: payload.items || [],
      };

      return {
        success: true,
        sourceProvider: 'CSV',
        targetType: 'SALE',
        data: mapped,
      };
    } catch (error) {
      return {
        success: false,
        sourceProvider: 'CSV',
        targetType: 'SALE',
        errors: [
          error instanceof Error
            ? error.message
            : 'Unknown mapping error',
        ],
      };
    }
  }
}
