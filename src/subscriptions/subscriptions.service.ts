import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Subscription } from './entities/subscription.entity';
import { Repository } from 'typeorm';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
  ) {}

  async create(data: Partial<Subscription>) {
    if (!data.tenantId) {
      throw new Error('tenantId es requerido');
    }

    await this.subscriptionRepo.update(
      { tenantId: data.tenantId },
      { status: 'EXPIRED' },
    );

    const sub = this.subscriptionRepo.create({
      ...data,
      status: data.status || 'ACTIVE',
    });

    return this.subscriptionRepo.save(sub);
  }

  findByTenant(tenantId: string) {
    return this.subscriptionRepo.findOne({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      order: {
        endDate: 'DESC',
      },
    });
  }
}