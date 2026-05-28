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
import { PosConfig } from './entities/pos-config.entity';
import { Product } from './entities/product.entity';
import { Category } from './entities/category.entity';
import { Area } from './entities/area.entity';
import { Table } from './entities/table.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PosConfig, Product, Category, Area, Table]),
  ],
  controllers: [
    PosController,
    ProductsController,
    CategoriesController,
    AreasController,
    TablesController,
  ],
  providers: [
    PosService,
    ProductsService,
    CategoriesService,
    AreasService,
    TablesService,
  ],
  exports: [
    PosService,
    ProductsService,
    CategoriesService,
    AreasService,
    TablesService,
  ],
})
export class PosModule {}
