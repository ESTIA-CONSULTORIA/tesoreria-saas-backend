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
import { CashiersController } from './cashiers.controller';
import { CashiersService } from './cashiers.service';
import { CorteFieldsController } from './corte-fields.controller';
import { CorteFieldsService } from './corte-fields.service';
import { CorteField } from './entities/corte-field.entity';
import { InsumoAlertsController } from './insumo-alerts.controller';
import { InsumoAlertsService } from './insumo-alerts.service';
import { InsumoAlert } from './entities/insumo-alert.entity';
import { PosConfig } from './entities/pos-config.entity';
import { Product } from './entities/product.entity';
import { PosCategory } from './entities/category.entity';
import { Area } from './entities/area.entity';
import { Table } from './entities/table.entity';
import { Sale } from './entities/sale.entity';
import { Shift } from './entities/shift.entity';
import { Recipe } from '../costs/entities/recipe.entity';
import { Insumo } from '../costs/entities/insumo.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PosConfig, Product, PosCategory, Area, Table, Sale, Shift, Recipe, Insumo, User, CorteField, InsumoAlert]),
  ],
  controllers: [
    PosController,
    ProductsController,
    CategoriesController,
    AreasController,
    TablesController,
    SalesController,
    ShiftsController,
    CashiersController,
    CorteFieldsController,
    InsumoAlertsController,
  ],
  providers: [
    PosService,
    ProductsService,
    CategoriesService,
    AreasService,
    TablesService,
    SalesService,
    ShiftsService,
    CashiersService,
    CorteFieldsService,
    InsumoAlertsService,
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
