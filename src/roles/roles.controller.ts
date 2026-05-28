import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Post()
  create(
    @Body()
    body: {
      code: string;
      name: string;
      description?: string;
    },
  ) {
    return this.rolesService.create(body.code, body.name, body.description);
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.rolesService.findByCode(code);
  }
}
