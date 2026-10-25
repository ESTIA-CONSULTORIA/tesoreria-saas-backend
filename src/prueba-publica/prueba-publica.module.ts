import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PruebaPublica } from './entities/prueba-publica.entity';
import { ListaEsperaGiro } from './entities/lista-espera-giro.entity';
import { PruebaEvento } from './entities/prueba-evento.entity';
import { PruebaCicloService } from './prueba-ciclo.service';
import { PurgadorSql } from './purgador-sql';
import { ListaEsperaService } from './lista-espera.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { User } from '../users/entities/user.entity';
import { Shift } from '../pos/entities/shift.entity';
import { Sale } from '../pos/entities/sale.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { PosModule } from '../pos/pos.module';
import { MembresiasModule } from '../membresias/membresias.module';
import { PruebaPublicaService } from './prueba-publica.service';
import { PruebaPublicaController } from './prueba-publica.controller';
import { CAPTCHA_VERIFIER, TENANT_PURGER, TurnstileVerifier } from './puertos';
import { CORREO_PROVIDER } from './correo/correo-provider';
import { crearCorreoProvider } from './correo/correo-provider.factory';

// Prueba pública (PP0 + PP3: tareas programadas, avisos de fin de prueba y purga física). Tablas nuevas: pp0 y prueba-publica-pp3-migration.sql.
// PP0: nada se activa al público (PRUEBA_PUBLICA_ACTIVA apagado por defecto). Tabla nueva: prueba-publica-pp0-migration.sql.
@Module({
  imports: [TypeOrmModule.forFeature([PruebaPublica, ListaEsperaGiro, PruebaEvento, Tenant, Company, Branch, User, Shift, Sale]), TenantsModule, SubscriptionsModule, TenantSettingsModule, PosModule, MembresiasModule],
  providers: [
    PruebaPublicaService,
    ListaEsperaService,
    PruebaCicloService,
    { provide: CAPTCHA_VERIFIER, useClass: TurnstileVerifier },
    { provide: CORREO_PROVIDER, useFactory: () => crearCorreoProvider() },
    { provide: TENANT_PURGER, useClass: PurgadorSql },
  ],
  controllers: [PruebaPublicaController],
  exports: [PruebaPublicaService],
})
export class PruebaPublicaModule {}
