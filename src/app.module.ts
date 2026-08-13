import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { AuditModule } from './audit/audit.module';
import { OcrModule } from './ocr/ocr.module';
import { PosChatModule } from './pos-chat/pos-chat.module';
import { HrModule } from './hr/hr.module';
import { PayrollModule } from './payroll/payroll.module';
import { ContractsModule } from './contracts/contracts.module';
import { StorageModule } from './storage/storage.module';
import { PatientsModule } from './patients/patients.module';
import { ModulesModule } from './modules/modules.module';
import { TenantModule } from './modules/entities/tenant-module.entity';
import { DeliveryIngestModule } from './integrations/delivery/delivery-ingest.module';
import { ExecutiveConfigModule } from './executive-config/executive-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    // Límite global generoso — no debe afectar el uso normal de la API (sync en
    // segundo plano del POS, dashboards, etc.). La regla estricta de verdad
    // (5 intentos / 15 min) se aplica solo en los 4 endpoints públicos de
    // login por contraseña/PIN vía @Throttle(), que sobreescribe este default ahí.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            ssl: { rejectUnauthorized: false },
            autoLoadEntities: true,
            synchronize: false,
            migrations: [__dirname + '/migrations/*{.ts,.js}'],
            migrationsRun: false,
          };
        }
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST') || 'localhost',
          port: Number(config.get<string>('DB_PORT') || '5432'),
          username: config.get<string>('DB_USER') || 'postgres',
          password: config.get<string>('DB_PASS') || 'postgres',
          database: config.get<string>('DB_NAME') || 'tesoreria',
          autoLoadEntities: true,
          synchronize: false,
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          migrationsRun: false,
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
    AuditModule,
    OcrModule,
    PosChatModule,
    HrModule,
    PayrollModule,
    ContractsModule,
    StorageModule,
    PatientsModule,
    ModulesModule,
    TypeOrmModule.forFeature([TenantModule]),
    DeliveryIngestModule,
    ExecutiveConfigModule,
  ],

  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    // Antes que SubscriptionGuard/PlanModuloGuard a propósito: rechazar una ráfaga de
    // peticiones debe ser lo más barato y temprano posible, sin gastar consultas a BD
    // en los otros guards primero.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanModuloGuard,
    },
  ],
})
export class AppModule {}