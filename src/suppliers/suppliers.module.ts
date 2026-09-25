import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { Supplier } from './entities/supplier.entity';
import { Purchase } from '../purchases/entities/purchase.entity';

@Module({
  // Purchase agregado para la recomendación #4 (seguimiento auditoría BUSINESS):
  // GET /suppliers/:id/purchases era un stub que siempre devolvía [] — se conecta a la
  // consulta real. Se inyecta el repositorio directo (mismo patrón que treasury.service.ts
  // con Purchase) en vez de importar PurchasesModule completo, para no acoplar los módulos.
  imports: [TypeOrmModule.forFeature([Supplier, Purchase])],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
