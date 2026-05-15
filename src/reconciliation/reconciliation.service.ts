import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Reconciliation } from './entities/reconciliation.entity';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(Reconciliation)
    private reconciliationRepository: Repository<Reconciliation>,
  ) {}

  async reconcile(data: Partial<Reconciliation>) {
    const externalAmount = Number(data.externalAmount || 0);
    const internalAmount = Number(data.internalAmount || 0);

    const difference = externalAmount - internalAmount;

    const reconciliation = this.reconciliationRepository.create({
      ...data,
      difference,
      status: difference === 0 ? 'MATCHED' : 'DIFFERENCE',
    });

    return this.reconciliationRepository.save(reconciliation);
  }

  findPendingDifferences() {
    return this.reconciliationRepository.find({
      where: {
        status: 'DIFFERENCE',
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async resolve(id: string, notes?: string) {
    await this.reconciliationRepository.update(id, {
      status: 'RESOLVED',
      notes,
    });

    return this.reconciliationRepository.findOne({
      where: { id },
    });
  }
}
