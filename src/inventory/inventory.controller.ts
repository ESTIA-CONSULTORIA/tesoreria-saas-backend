import { Body, Controller, Get, Post } from '@nestjs/common';

import { InventoryService } from './inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post('products')
  createProduct(@Body() body: CreateProductDto) {
    return this.inventoryService.createProduct(body);
  }

  @Get('products')
  findProducts() {
    return this.inventoryService.findProducts();
  }

  @Post('movements')
  registerMovement(@Body() body: CreateInventoryMovementDto) {
    return this.inventoryService.registerMovement(body);
  }
}
