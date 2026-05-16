import { Injectable } from '@nestjs/common';

@Injectable()
export class ReconciliationEngineService {
  async reconcile(payload: {
    sourceAmount: number;
    targetAmount: number;
    sourceReference?: string;
    targetReference?: string;
  }) {
    const difference =
      Number(payload.sourceAmount || 0) -
      Number(payload.targetAmount || 0);

    const matched = difference === 0;

    return {
      success: true,
      matched,
      difference,
      status: matched ? 'MATCHED' : 'PENDING_REVIEW',
    };
  }
}
