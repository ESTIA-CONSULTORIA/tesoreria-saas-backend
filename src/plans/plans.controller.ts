import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { Feature } from '../auth/feature/decorator';
import { CreatePlanDto } from './dto/create-plan.dto';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Post()
  create(@Body() body: CreatePlanDto) {
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
