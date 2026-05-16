import { Injectable } from '@nestjs/common';

@Injectable()
export class ReportingWorker {
  async process(job: {
    name: string;
    data: any;
  }) {
    // Future implementation:
    // - generate KPIs
    // - generate financial statements
    // - refresh dashboard cache
    // - generate analytics snapshots

    return {
      success: true,
      worker: 'reporting',
      jobName: job.name,
    };
  }
}
