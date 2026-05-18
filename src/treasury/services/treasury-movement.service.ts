import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { MovementsService } from '../../movements/movements.service';

@Injectable()
export class TreasuryMovementService {
  constructor(
    private readonly movementsService: MovementsService,
  ) {}

  async registerSaleIncome(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    accountId?: string;
    saleId: string;
    amount: number;
    currency?: string;
  }) {
    if (!payload.saleId) {
      throw new BadRequestException(
        'SaleId requerido',
      );
    }

    if (Number(payload.amount || 0) <= 0) {
      throw new BadRequestException(
        'Monto inválido',
      );
    }

    if (payload.accountId) {
      await this.movementsService.create(
        payload.accountId,
        'INCOME',
        'SALE',
        'Venta registrada',
        payload.amount,
        payload.saleId,
      );
    }

    return {
      success: true,
      movementType: 'SALE_INCOME',
      saleId: payload.saleId,
      amount: payload.amount,
    };
  }

  async registerPurchaseExpense(payload: {
    tenantId: string;
    companyId: string;
    branchId?: string;
    accountId?: string;
    purchaseId: string;
    amount: number;
    currency?: string;
  }) {
    if (!payload.purchaseId) {
      throw new BadRequestException(
        'PurchaseId requerido',
      );
    }

    if (Number(payload.amount || 0) <= 0) {
      throw new BadRequestException(
        'Monto inválido',
      );
    }

    if (payload.accountId) {
      await this.movementsService.create(
        payload.accountId,
        'EXPENSE',
        'PURCHASE',
        'Compra registrada',
        payload.amount,
        payload.purchaseId,
      );
    }

    return {
      success: true,
      movementType: 'PURCHASE_EXPENSE',
      purchaseId: payload.purchaseId,
      amount: payload.amount,
    };
  }
}
