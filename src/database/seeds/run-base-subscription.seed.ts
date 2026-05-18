import { DataSource } from 'typeorm';

import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { baseSubscription } from './base-subscription.seed';

export async function runBaseSubscriptionSeed(dataSource: DataSource) {
  const subscriptionRepository =
    dataSource.getRepository(Subscription);

  const existingSubscription = await subscriptionRepository.findOne({
    where: {
      tenantId: baseSubscription.tenantId,
      status: 'ACTIVE',
    },
  });

  if (!existingSubscription) {
    await subscriptionRepository.save(
      subscriptionRepository.create(baseSubscription),
    );
  }

  return {
    success: true,
  };
}
