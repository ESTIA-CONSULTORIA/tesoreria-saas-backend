import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class SalesFinancialService {
  private readonly logger = new Logger(
    SalesFinancialService.name,
  );

  async generateTreasuryMovement(payload: {
    saleId: string;
    tenantId?: string;
    companyId?: string;
    branchId?: string;
    total: number;
    currency?: string;
  }) {
    const normalizedSaleId = String(
      payload.saleId || '',
    ).trim();

    const total = Number(payload.total || 0);

    const currency = String(
      payload.currency || 'MXN',
    )
      .trim()
      .toUpperCase();

    if (!normalizedSaleId) {
      throw new BadRequestException(
        'saleId requerido',
      );
    }

    if (!total || total <= 0) {
      throw new BadRequestException(
        'Total inválido para treasury',
      );
    }

    this.logger.log(
      `Generating treasury movement for sale ${normalizedSaleId}`,
    );

    return {
      success: true,
      type: 'SALE_TREASURY_MOVEMENT',
      referenceId: normalizedSaleId,
      total,
      currency,
      generatedAt: new Date().toISOString(),
    };
  }
}
