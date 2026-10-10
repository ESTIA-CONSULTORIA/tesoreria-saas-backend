import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Socio } from './entities/socio.entity';
import { PlanMembresia } from './entities/plan-membresia.entity';
import { Membresia } from './entities/membresia.entity';
import { CheckinSocio } from './entities/checkin-socio.entity';
import { Product } from '../pos/entities/product.entity';
import { PosCategory } from '../pos/entities/category.entity';
import { Sale } from '../pos/entities/sale.entity';
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module';
import { MembresiasCoreService } from './membresias-core.service';
import { MembresiasService } from './membresias.service';
import { MembresiasController } from './membresias.controller';

// Gimnasio. MembresiasCoreService (lo que el POS necesita) no depende de SalesService: PosModule importa este módulo y no al
// revés, así no hay ciclo. El cobro de una membresía es una venta normal del POS.
@Module({
  imports: [TypeOrmModule.forFeature([Socio, PlanMembresia, Membresia, CheckinSocio, Product, PosCategory, Sale]), TenantSettingsModule],
  providers: [MembresiasCoreService, MembresiasService],
  controllers: [MembresiasController],
  exports: [MembresiasCoreService],
})
export class MembresiasModule {}
