import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlansService } from './plans.service';
import { Plan } from './entities/plan.entity';


@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  // El catálogo de planes lo edita solo SOPORTE (lectura sigue abierta a cualquier sesión).
  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Post()
  create(@Body() body: Partial<Plan>) {
    return this.plansService.create(body);
  }

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.plansService.findByCode(code);
  }

  @UseGuards(RolesGuard)
  @Roles('SOPORTE')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Plan>) {
    return this.plansService.update(id, body);
  }
}