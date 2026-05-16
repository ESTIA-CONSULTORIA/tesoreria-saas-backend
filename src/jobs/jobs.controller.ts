import { Body, Controller, Get, Post } from '@nestjs/common';

import { JobsService } from './jobs.service';
import { Job } from './entities/job.entity';

@Controller('jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  create(@Body() body: Partial<Job>) {
    return this.jobsService.create(body);
  }

  @Get()
  findAll() {
    return this.jobsService.findAll();
  }

  @Get('runnable')
  findRunnableJobs() {
    return this.jobsService.findRunnableJobs();
  }
}
