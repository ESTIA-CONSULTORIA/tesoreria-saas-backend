import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

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

import { SubscriptionGuard } from './auth/subscription.guard';
import { FeatureGuard } from './auth/feature/feature.guard';
import { PlanModuloGuard } from './auth/plan-modulo.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
import { IntegrationsModule } from './integrations/integrations.module';
import { RolesModule } from './roles/roles.module';
import { BanksModule } from './banks/banks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { TenantSettingsModule } from './tenant-settings/tenant-settings.module';
import { TreasuryModule } from './treasury/treasury.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AdministrationModule } from './administration/administration.module';
import { PosModule } from './pos/pos.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { CostsModule } from './costs/costs.module';
import { AddonsModule } from './addons/addons.module';
import { AuditModule } from './audit/audit.module';
import { OcrModule } from './ocr/ocr.module';
import { PosChatModule } from './pos-chat/pos-chat.module';

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
        synchronize: true,
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
    RolesModule,
    BanksModule,
    DashboardModule,
    ReportsModule,
    TenantSettingsModule,
    TreasuryModule,
    ReconciliationModule,
    AdministrationModule,
    PosModule,
    SuppliersModule,
    PurchasesModule,
    CostsModule,
    AddonsModule,
    AuditModule,
    OcrModule,
    PosChatModule,
  ],

  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanModuloGuard,
    },
  ],
})
export class AppModule {}