import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BusinessTypesService } from './business-types.service';
import { BusinessType } from './entities/business-type.entity';

@Controller('business-types')
export class BusinessTypesController {
  constructor(private businessTypesService: BusinessTypesService) {}

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post()
  create(@Body() body: Partial<BusinessType>) {
    return this.businessTypesService.create(body);
  }

  @Get()
  findAll() {
    return this.businessTypesService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.businessTypesService.findByCode(code);
  }
}