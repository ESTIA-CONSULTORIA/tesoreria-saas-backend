import {
  Logger,
} from '@nestjs/common';
import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('reporting')
export class ReportingProcessor extends WorkerHost {
  private readonly logger = new Logger(
    ReportingProcessor.name,
  );

  async process(job: Job<any>): Promise<any> {
    this.logger.log(
      `Processing reporting job: ${job.name}`,
    );

    return {
      processed: true,
      jobId: job.id,
      queue: 'reporting',
      completedAt: new Date().toISOString(),
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(
      `Reporting job completed: ${job.id}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    this.logger.error(
      `Reporting job failed: ${job?.id}`,
    );
  }
}
