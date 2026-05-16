import { Body, Controller, Get, Post } from '@nestjs/common';

import { InventoryService } from './inventory.service';
import { Product } from './entities/product.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';

@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post('products')
  createProduct(@Body() body: Partial<Product>) {
    return this.inventoryService.createProduct(body);
  }

  @Get('products')
  findProducts() {
    return this.inventoryService.findProducts();
  }

  @Post('movements')
  registerMovement(@Body() body: Partial<InventoryMovement>) {
    return this.inventoryService.registerMovement(body);
  }
}
