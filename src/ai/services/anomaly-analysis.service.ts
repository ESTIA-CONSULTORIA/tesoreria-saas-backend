import { Injectable } from '@nestjs/common';

@Injectable()
export class AnomalyAnalysisService {
  async analyzeInventoryVariance(payload: {
    theoretical: number;
    actual: number;
    productId: string;
  }) {
    const difference = Number(payload.actual || 0) -
      Number(payload.theoretical || 0);

    return {
      success: true,
      anomalyDetected: Math.abs(difference) > 0,
      difference,
      productId: payload.productId,
    };
  }

  async analyzePurchaseBehavior(payload: {
    currentCost: number;
    previousAverageCost: number;
  }) {
    const variation =
      Number(payload.currentCost || 0) -
      Number(payload.previousAverageCost || 0);

    return {
      success: true,
      anomalyDetected: Math.abs(variation) > 0,
      variation,
    };
  }
}
