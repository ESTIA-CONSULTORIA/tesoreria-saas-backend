import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  @Feature('POS')
  findAll() {
    return this.plansService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.plansService.findByCode(code);
  }
}