import { Injectable } from '@nestjs/common';

@Injectable()
export class SalesWorker {
  async process(job: {
    name: string;
    data: any;
  }) {
    // Future implementation:
    // - validate idempotency key
    // - run sales transaction orchestrator
    // - emit domain events
    // - persist audit trail
    // - notify realtime dashboard

    return {
      success: true,
      worker: 'sales',
      jobName: job.name,
    };
  }
}
