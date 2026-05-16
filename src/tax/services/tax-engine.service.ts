import { Injectable } from '@nestjs/common';

@Injectable()
export class TaxEngineService {
  async calculateSaleTaxes(payload: {
    subtotal: number;
    taxRate: number;
  }) {
    const taxes = Number(payload.subtotal || 0) *
      (Number(payload.taxRate || 0) / 100);

    return {
      success: true,
      subtotal: payload.subtotal,
      taxes,
      total: Number(payload.subtotal || 0) + taxes,
    };
  }

  async calculatePurchaseTaxes(payload: {
    subtotal: number;
    taxRate: number;
  }) {
    const taxes = Number(payload.subtotal || 0) *
      (Number(payload.taxRate || 0) / 100);

    return {
      success: true,
      subtotal: payload.subtotal,
      taxes,
      total: Number(payload.subtotal || 0) + taxes,
    };
  }
}
