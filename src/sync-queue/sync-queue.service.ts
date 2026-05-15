import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { SyncQueue } from './entities/sync-queue.entity';

@Injectable()
export class SyncQueueService {
  constructor(
    @InjectRepository(SyncQueue)
    private syncQueueRepository: Repository<SyncQueue>,
  ) {}

  enqueue(data: Partial<SyncQueue>) {
    const item = this.syncQueueRepository.create(data);
    return this.syncQueueRepository.save(item);
  }

  findPending() {
    return this.syncQueueRepository.find({
      where: [
        {
          status: 'PENDING',
        },
        {
          status: 'ERROR',
          nextRetryAt: LessThanOrEqual(new Date()),
        },
      ],
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async markAsProcessing(id: string) {
    await this.syncQueueRepository.update(id, {
      status: 'PROCESSING',
    });

    return this.syncQueueRepository.findOne({
      where: { id },
    });
  }

  async markAsSynced(id: string) {
    await this.syncQueueRepository.update(id, {
      status: 'SYNCED',
      syncedAt: new Date(),
      errorMessage: null,
    });

    return this.syncQueueRepository.findOne({
      where: { id },
    });
  }

  async markAsError(id: string, errorMessage: string) {
    const item = await this.syncQueueRepository.findOne({
      where: { id },
    });

    if (!item) {
      return null;
    }

    const retryCount = item.retryCount + 1;

    const nextRetry = new Date();
    nextRetry.setMinutes(nextRetry.getMinutes() + 5);

    await this.syncQueueRepository.update(id, {
      status: retryCount >= item.maxRetries ? 'FAILED' : 'ERROR',
      errorMessage,
      retryCount,
      nextRetryAt: nextRetry,
    });

    return this.syncQueueRepository.findOne({
      where: { id },
    });
  }
}
