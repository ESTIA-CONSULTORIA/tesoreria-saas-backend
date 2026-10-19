import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PruebaPublica } from './entities/prueba-publica.entity';
import { ListaEsperaGiro } from './entities/lista-espera-giro.entity';
import { ListaEsperaService } from './lista-espera.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { PosModule } from '../pos/pos.module';
import { MembresiasModule } from '../membresias/membresias.module';
import { PruebaPublicaService } from './prueba-publica.service';
import { PruebaPublicaController } from './prueba-publica.controller';
import { CAPTCHA_VERIFIER, TENANT_PURGER, PurgadorPendiente, TurnstileVerifier } from './puertos';
import { CORREO_PROVIDER } from './correo/correo-provider';
import { crearCorreoProvider } from './correo/correo-provider.factory';

// Prueba pública, PP0: nada se activa al público (PRUEBA_PUBLICA_ACTIVA apagado por defecto). Tabla nueva: prueba-publica-pp0-migration.sql.
@Module({
  imports: [TypeOrmModule.forFeature([PruebaPublica, ListaEsperaGiro, Tenant, Company, Branch]), TenantsModule, SubscriptionsModule, TenantSettingsModule, PosModule, MembresiasModule],
  providers: [
    PruebaPublicaService,
    ListaEsperaService,
    { provide: CAPTCHA_VERIFIER, useClass: TurnstileVerifier },
    { provide: CORREO_PROVIDER, useFactory: () => crearCorreoProvider() },
    { provide: TENANT_PURGER, useClass: PurgadorPendiente },
  ],
  controllers: [PruebaPublicaController],
  exports: [PruebaPublicaService],
})
export class PruebaPublicaModule {}
