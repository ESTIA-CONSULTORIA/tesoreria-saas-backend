import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PlansService } from './plans.service';
import { Feature } from '../auth/feature/decorator';
import { Plan } from './entities/plan.entity';


@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

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

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<Plan>) {
    return this.plansService.update(id, body);
  }
}