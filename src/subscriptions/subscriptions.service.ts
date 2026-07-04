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
    await this.subscriptionRepo.update(
      { tenantId, status: 'ACTIVE' },
      { status: 'EXPIRED' },
    );

    const sub = this.subscriptionRepo.create({
      tenantId,
      planCode,
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
      status: 'ACTIVE',
    });

    return this.subscriptionRepo.save(sub);
  }

  async createForTenant(tenantId: string, planCode: string, billingCycle = 'monthly') {
    const PRICES: Record<string, number> = {
      LITE_CORTE: 650, LITE_POS: 650,
      BASIC: 890, PRO: 1490,
      BUSINESS: 1980, ENTERPRISE: 0,
    };

    const startDate = new Date();
    const endDate = new Date();
    if (billingCycle === 'annual') {
      endDate.setMonth(endDate.getMonth() + 12);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    await this.subscriptionRepo.update(
      { tenantId, status: 'ACTIVE' },
      { status: 'EXPIRED' },
    );

    return this.subscriptionRepo.save({
      tenantId,
      planCode,
      billingCycle,
      price: PRICES[planCode] ?? 0,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      status: 'ACTIVE',
      alertSent7: false,
      alertSent5: false,
      alertSent1: false,
    });
  }

  async getExpiringSubscriptions(daysBefore: number) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);

    return this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'ACTIVE' })
      .andWhere('s.endDate <= :target', { target: targetDate.toISOString().split('T')[0] })
      .andWhere('s.endDate >= :now', { now: new Date().toISOString().split('T')[0] })
      .getMany();
  }

  async renewSubscription(tenantId: string) {
    const sub = await this.findByTenant(tenantId);
    if (!sub) throw new Error('Suscripción no encontrada');

    const newEnd = new Date(sub.endDate ?? new Date());
    if (sub.billingCycle === 'annual') {
      newEnd.setMonth(newEnd.getMonth() + 12);
    } else {
      newEnd.setMonth(newEnd.getMonth() + 1);
    }

    sub.endDate = newEnd.toISOString().split('T')[0];
    sub.status = 'ACTIVE';
    sub.alertSent7 = false;
    sub.alertSent5 = false;
    sub.alertSent1 = false;
    return this.subscriptionRepo.save(sub);
  }
}