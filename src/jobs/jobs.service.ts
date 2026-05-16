import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { Job } from './entities/job.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private jobsRepository: Repository<Job>,
  ) {}

  create(data: Partial<Job>) {
    const job = this.jobsRepository.create(data);
    return this.jobsRepository.save(job);
  }

  findAll() {
    return this.jobsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  findRunnableJobs() {
    return this.jobsRepository.find({
      where: {
        status: 'ACTIVE',
        nextRunAt: LessThanOrEqual(new Date()),
      },
      order: {
        nextRunAt: 'ASC',
      },
    });
  }

  async markRun(
    id: string,
    runStatus: 'SUCCESS' | 'ERROR',
    error?: string,
  ) {
    const job = await this.jobsRepository.findOne({
      where: { id },
    });

    if (!job) {
      return null;
    }

    let nextRunAt: Date | null = null;

    if (job.intervalMinutes) {
      nextRunAt = new Date();
      nextRunAt.setMinutes(
        nextRunAt.getMinutes() + job.intervalMinutes,
      );
    }

    await this.jobsRepository.update(id, {
      lastRunAt: new Date(),
      lastStatus: runStatus,
      lastError: error || null,
      nextRunAt,
    });

    return this.jobsRepository.findOne({
      where: { id },
    });
  }
}
