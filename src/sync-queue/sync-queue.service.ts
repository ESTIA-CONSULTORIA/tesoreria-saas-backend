import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

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
      where: { status: 'PENDING' },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async markAsSynced(id: string) {
    await this.syncQueueRepository.update(id, {
      status: 'SYNCED',
      syncedAt: new Date(),
    });

    return this.syncQueueRepository.findOne({
      where: { id },
    });
  }
}
