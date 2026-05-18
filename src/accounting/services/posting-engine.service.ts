import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class PostingEngineService {
  async postSale(payload: {
    saleId: string;
    total: number;
    taxes: number;
    paymentMethod?: string;
  }) {
    if (!payload.saleId) {
      throw new BadRequestException(
        'SaleId requerido',
      );
    }

    if (Number(payload.total || 0) <= 0) {
      throw new BadRequestException(
        'Total inválido',
      );
    }

    return {
      success: true,
      transactionType: 'SALE',
      referenceId: payload.saleId,
    };
  }

  async postPurchase(payload: {
    purchaseId: string;
    total: number;
    taxes: number;
  }) {
    if (!payload.purchaseId) {
      throw new BadRequestException(
        'PurchaseId requerido',
      );
    }

    if (Number(payload.total || 0) <= 0) {
      throw new BadRequestException(
        'Total inválido',
      );
    }

    return {
      success: true,
      transactionType: 'PURCHASE',
      referenceId: payload.purchaseId,
    };
  }

  async postPayment(payload: {
    referenceId: string;
    amount: number;
    type: string;
  }) {
    if (!payload.referenceId) {
      throw new BadRequestException(
        'ReferenceId requerido',
      );
    }

    if (Number(payload.amount || 0) <= 0) {
      throw new BadRequestException(
        'Monto inválido',
      );
    }

    if (!payload.type) {
      throw new BadRequestException(
        'Tipo requerido',
      );
    }

    return {
      success: true,
      transactionType: payload.type,
      referenceId: payload.referenceId,
    };
  }
}
