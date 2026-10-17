import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../pos/entities/product.entity';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { SucursalFiscal } from './entities/sucursal-fiscal.entity';
import { ProductoFiscal } from './entities/producto-fiscal.entity';
import { ReceptorFiscal } from './entities/receptor-fiscal.entity';
import { FacturacionService } from './facturacion.service';
import { FacturacionController } from './facturacion.controller';
import { PAC_PROVIDER } from './pac/pac-provider';
import { crearPacProvider } from './pac/pac-provider.factory';

// CFDI 4.0, fase 0: datos fiscales + puerto PacProvider con adaptador Mock. Sin timbrado real. Las tablas son NUEVAS
// (facturacion-f0-migration.sql): el código desplegado no toca product/company/branch, así que no depende de correr el SQL antes.
@Module({
  imports: [TypeOrmModule.forFeature([EmisorFiscal, SucursalFiscal, ProductoFiscal, ReceptorFiscal, Company, Branch, Product])],
  providers: [FacturacionService, { provide: PAC_PROVIDER, useFactory: () => crearPacProvider('mock') }],
  controllers: [FacturacionController],
  exports: [FacturacionService, PAC_PROVIDER],
})
export class FacturacionModule {}
