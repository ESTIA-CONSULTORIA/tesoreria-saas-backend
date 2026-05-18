import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsModule } from './accounts/accounts.module';
import { AccountingModule } from './accounting/accounting.module';
import { AuthModule } from './auth/auth.module';
import { FeatureGuard } from './auth/feature/feature.guard';
import { SubscriptionGuard } from './auth/subscription.guard';
import { BranchesModule } from './branches/branches.module';
import { BusinessTypesModule } from './business-types/business-types.module';
import { CategoriesModule } from './categories/categories.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { CompaniesModule } from './companies/companies.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { InventoryModule } from './inventory/inventory.module';
import { MovementsModule } from './movements/movements.module';
import { PlansModule } from './plans/plans.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SalesModule } from './sales/sales.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SyncQueueModule } from './sync-queue/sync-queue.module';
import { TenantsModule } from './tenants/tenants.module';
import { TransfersModule } from './transfers/transfers.module';
import { TreasuryModule } from './treasury/treasury.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction =
          config.get<string>('NODE_ENV') ===
          'production';

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST') || 'localhost',
          port: Number(
            config.get<string>('DB_PORT') || 5432,
          ),
          username:
            config.get<string>('DB_USER') ||
            'postgres',
          password:
            config.get<string>('DB_PASS') || '',
          database:
            config.get<string>('DB_NAME') ||
            'tesoreria',
          autoLoadEntities: true,
          synchronize: !isProduction,
          retryAttempts: 5,
          retryDelay: 3000,
          logging: !isProduction,
        };
      },
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
