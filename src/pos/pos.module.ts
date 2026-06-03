import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { PosConfig } from './entities/pos-config.entity';
import { Product } from './entities/product.entity';
import { PosCategory } from './entities/category.entity';
import { Area } from './entities/area.entity';
import { Table } from './entities/table.entity';
import { Sale } from './entities/sale.entity';
import { Shift } from './entities/shift.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PosConfig, Product, PosCategory, Area, Table, Sale, Shift]),
  ],
  controllers: [
    PosController,
    ProductsController,
    CategoriesController,
    AreasController,
    TablesController,
    SalesController,
    ShiftsController,
  ],
  providers: [
    PosService,
    ProductsService,
    CategoriesService,
    AreasService,
    TablesService,
    SalesService,
    ShiftsService,
  ],
  exports: [
    PosService,
    ProductsService,
    CategoriesService,
    AreasService,
    TablesService,
    SalesService,
    ShiftsService,
  ],
})
export class PosModule {}
