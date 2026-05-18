import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class SalesReportingService {
  async generateKpis(payload: {
    saleId: string;
    total: number;
    subtotal: number;
    taxes: number;
    discounts: number;
    branchId: string;
    companyId: string;
    tenantId: string;
  }) {
    const saleId = String(
      payload.saleId || '',
    ).trim();

    const total = Number(payload.total || 0);

    if (!saleId) {
      throw new BadRequestException(
        'saleId requerido para reporting',
      );
    }

    if (total < 0) {
      throw new BadRequestException(
        'total inválido para reporting',
      );
    }

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      referenceId: saleId,
      totals: {
        total,
        subtotal: Number(payload.subtotal || 0),
        taxes: Number(payload.taxes || 0),
        discounts: Number(payload.discounts || 0),
      },
      generatedMetrics: [
        'DAILY_SALES',
        'AVERAGE_TICKET',
        'SALES_TOTAL',
      ],
    };
  }
}
