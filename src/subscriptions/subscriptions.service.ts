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

    // Expirar suscripciones anteriores
    await this.subscriptionRepo.update(
      { tenantId: data.tenantId },
      { status: 'EXPIRED' },
    );

    // Crear nueva suscripción
    const sub = this.subscriptionRepo.create({
  ...data,
  startDate: new Date().toISOString().split('T')[0],
  endDate: null,
  status: data.status || 'ACTIVE',
});

    return this.subscriptionRepo.save(sub);
  }

  async findByTenant(tenantId: string) {
    return this.subscriptionRepo.findOne({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      order: {
        startDate: 'DESC',
      },
    });
  }

  async updatePlan(tenantId: string, planCode: string) {
    // Expirar suscripción anterior
    await this.subscriptionRepo.update(
      { tenantId, status: 'ACTIVE' },
      { status: 'EXPIRED' },
    );

    // Crear nueva suscripción con el nuevo plan
    const sub = this.subscriptionRepo.create({
      tenantId,
      planCode,
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
      status: 'ACTIVE',
    });

    return this.subscriptionRepo.save(sub);
  }
}