import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { CompaniesModule } from './companies/companies.module';
import { BranchesModule } from './branches/branches.module';
import { AccountsModule } from './accounts/accounts.module';
import { MovementsModule } from './movements/movements.module';
import { CategoriesModule } from './categories/categories.module';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { TransfersModule } from './transfers/transfers.module';
import { BusinessTypesModule } from './business-types/business-types.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SyncQueueModule } from './sync-queue/sync-queue.module';
import { SalesModule } from './sales/sales.module';
import { InventoryModule } from './inventory/inventory.module';
import { AccountingModule } from './accounting/accounting.module';
import { TreasuryModule } from './treasury/treasury.module';
import { RealtimeModule } from './realtime/realtime.module';

import { SubscriptionGuard } from './auth/subscription.guard';
import { FeatureGuard } from './auth/feature/feature.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<string>('DB_PORT')),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize:
          config.get<string>('NODE_ENV') !== 'production',
      }),
    }),

    UsersModule,
    AuthModule,
    TenantsModule,
    CompaniesModule,
    BranchesModule,
    AccountsModule,
    MovementsModule,
    CategoriesModule,
    PlansModule,
    SubscriptionsModule,
    TransfersModule,
    BusinessTypesModule,
    IntegrationsModule,
    SyncQueueModule,
    SalesModule,
    InventoryModule,
    AccountingModule,
    TreasuryModule,
    RealtimeModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
  ],
})
export class AppModule {}
