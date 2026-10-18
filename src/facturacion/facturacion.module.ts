import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../pos/entities/product.entity';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { SucursalFiscal } from './entities/sucursal-fiscal.entity';
import { ProductoFiscal } from './entities/producto-fiscal.entity';
import { ReceptorFiscal } from './entities/receptor-fiscal.entity';
import { CsdFiscal } from './entities/csd-fiscal.entity';
import { Factura, FacturaEvento, FacturaVenta, SerieFiscal } from './entities/factura.entity';
import { Sale } from '../pos/entities/sale.entity';
import { FacturasService } from './facturas.service';
import { FacturasController } from './facturas.controller';
import { CsdService } from './csd.service';
import { PosCategory } from '../pos/entities/category.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { FacturacionService } from './facturacion.service';
import { FacturacionLecturasService } from './facturacion-lecturas.service';
import { FacturacionController } from './facturacion.controller';
import { PAC_PROVIDER } from './pac/pac-provider';
import { crearPacProvider } from './pac/pac-provider.factory';

// CFDI 4.0, fases 0 y 1: datos fiscales, puerto PacProvider con adaptador Mock, CSD cifrado, facturas desde caja y nota de crédito.
// SIN timbrado real: todo sale marcado sin validez fiscal. Las tablas son NUEVAS (facturacion-f0-migration.sql y facturacion-f1-migration.sql): el código desplegado no toca product/company/branch, así que no depende de correr el SQL antes.
@Module({
  imports: [TypeOrmModule.forFeature([EmisorFiscal, SucursalFiscal, ProductoFiscal, ReceptorFiscal, CsdFiscal, Factura, FacturaVenta, FacturaEvento, SerieFiscal, Sale, Company, Branch, Product, PosCategory, Tenant])],
  providers: [FacturacionService, FacturacionLecturasService, FacturasService, CsdService, { provide: PAC_PROVIDER, useFactory: () => crearPacProvider('mock') }],
  controllers: [FacturacionController, FacturasController],
  exports: [FacturacionService, PAC_PROVIDER],
})
export class FacturacionModule {}
