import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SystemEvent } from './entities/system-event.entity';

@Injectable()
export class SystemEventsService {
  constructor(
    @InjectRepository(SystemEvent)
    private systemEventRepository: Repository<SystemEvent>,
  ) {}

  emit(data: Partial<SystemEvent>) {
    const event = this.systemEventRepository.create(data);
    return this.systemEventRepository.save(event);
  }

  findOpenEvents() {
    return this.systemEventRepository.find({
      where: {
        status: 'OPEN',
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async acknowledge(id: string) {
    await this.systemEventRepository.update(id, {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
    });

    return this.systemEventRepository.findOne({
      where: { id },
    });
  }

  async close(id: string) {
    await this.systemEventRepository.update(id, {
      status: 'CLOSED',
      closedAt: new Date(),
    });

    return this.systemEventRepository.findOne({
      where: { id },
    });
  }
}
