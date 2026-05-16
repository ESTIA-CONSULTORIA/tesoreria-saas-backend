import { Injectable } from '@nestjs/common';

@Injectable()
export class ForecastingService {
  async projectCashFlow(payload: {
    currentBalance: number;
    projectedIncome: number;
    projectedExpenses: number;
  }) {
    const projected =
      Number(payload.currentBalance || 0) +
      Number(payload.projectedIncome || 0) -
      Number(payload.projectedExpenses || 0);

    return {
      success: true,
      projectedBalance: projected,
    };
  }

  async estimateSalesTrend(payload: {
    currentSales: number;
    previousSales: number;
  }) {
    const variation =
      Number(payload.currentSales || 0) -
      Number(payload.previousSales || 0);

    return {
      success: true,
      trend: variation >= 0 ? 'UP' : 'DOWN',
      variation,
    };
  }
}
