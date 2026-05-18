import { DataSource } from 'typeorm';

import { Plan } from '../../plans/entities/plan.entity';
import { basePlans } from './base-plans.seed';

export async function runBasePlansSeed(dataSource: DataSource) {
  const plansRepository = dataSource.getRepository(Plan);

  for (const plan of basePlans) {
    const exists = await plansRepository.findOne({
      where: {
        code: plan.code,
      },
    });

    if (!exists) {
      await plansRepository.save(
        plansRepository.create({
          ...plan,
          maxCompanies: 10,
          maxBranches: 50,
          maxUsers: 200,
          allowTreasury: true,
          allowPOS: true,
          allowInventory: true,
          allowReceivables: true,
          allowPayables: true,
          allowReports: true,
          isActive: true,
        }),
      );
    }
  }

  return {
    success: true,
    plans: basePlans.length,
  };
}
