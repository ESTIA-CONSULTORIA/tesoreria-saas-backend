import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';

@Injectable()
export class SubscriptionAlertsService {
  private readonly logger = new Logger(SubscriptionAlertsService.name);

  constructor(
    @InjectRepository(Subscription)
    private subRepo: Repository<Subscription>,
  ) {}

  @Cron('0 9 * * *')
  async checkExpiringSubscriptions() {
    this.logger.log('Verificando suscripciones por vencer...');
    const today = new Date();
    await this.checkAndMarkAlert(today, 7, 'alertSent7');
    await this.checkAndMarkAlert(today, 5, 'alertSent5');
    await this.checkAndMarkAlert(today, 1, 'alertSent1');
    await this.deactivateExpired(today);
  }

  private async checkAndMarkAlert(
    today: Date,
    daysBefore: number,
    field: 'alertSent7' | 'alertSent5' | 'alertSent1',
  ) {
    const subs = await this.subRepo.find({
      where: { status: 'ACTIVE', [field]: false },
    });

    for (const sub of subs) {
      if (!sub.endDate) continue;
      const endDate = new Date(sub.endDate);
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= daysBefore && diffDays > 0) {
        sub[field] = true;
        sub.alertSentAt = new Date();
        await this.subRepo.save(sub);
        this.logger.warn(`ALERTA ${daysBefore}d: tenant ${sub.tenantId} vence el ${sub.endDate}`);
      }
    }
  }

  private async deactivateExpired(today: Date) {
    const subs = await this.subRepo.find({ where: { status: 'ACTIVE' } });
    for (const sub of subs) {
      if (sub.endDate && new Date(sub.endDate) < today) {
        sub.status = 'EXPIRED';
        await this.subRepo.save(sub);
        this.logger.warn(`EXPIRADA: tenant ${sub.tenantId}`);
      }
    }
  }

  async getAlerts() {
    const today = new Date();
    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);

    return this.subRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'ACTIVE' })
      .andWhere('s.endDate <= :target', { target: in7days.toISOString().split('T')[0] })
      .orderBy('s.endDate', 'ASC')
      .getMany();
  }
}
