import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { KpiSnapshot } from './entities/kpi-snapshot.entity';

@Injectable()
export class ReportingService {
  constructor(
    @InjectRepository(KpiSnapshot)
    private kpiRepository: Repository<KpiSnapshot>,
  ) {}

  createSnapshot(data: Partial<KpiSnapshot>) {
    const snapshot = this.kpiRepository.create(data);
    return this.kpiRepository.save(snapshot);
  }

  findRecentSnapshots(metric?: string) {
    return this.kpiRepository.find({
      where: metric ? { metric } : {},
      order: {
        createdAt: 'DESC',
      },
      take: 100,
    });
  }

  async getDashboardSummary() {
    const snapshots = await this.kpiRepository.find({
      order: {
        createdAt: 'DESC',
      },
      take: 500,
    });

    const grouped = snapshots.reduce((acc, item) => {
      if (!acc[item.metric]) {
        acc[item.metric] = [];
      }

      acc[item.metric].push(item);
      return acc;
    }, {} as Record<string, KpiSnapshot[]>);

    return grouped;
  }
}
