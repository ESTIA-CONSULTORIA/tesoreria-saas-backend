import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Subscription } from './entities/subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepo: Repository<Subscription>,
  ) {}

  async create(data: Partial<Subscription>) {
    const tenantId = String(data.tenantId || '').trim();

    if (!tenantId) {
      throw new BadRequestException(
        'tenantId es requerido',
      );
    }

    const normalizedStatus = String(
      data.status || 'ACTIVE',
    )
      .trim()
      .toUpperCase();

    await this.subscriptionRepo.update(
      { tenantId },
      { status: 'EXPIRED' },
    );

    const sub = this.subscriptionRepo.create({
      ...data,
      tenantId,
      status: normalizedStatus,
    });

    return this.subscriptionRepo.save(sub);
  }

  findByTenant(tenantId: string) {
    return this.subscriptionRepo.findOne({
      where: {
        tenantId: String(tenantId || '').trim(),
        status: 'ACTIVE',
      },
      order: {
        endDate: 'DESC',
      },
    });
  }
}
