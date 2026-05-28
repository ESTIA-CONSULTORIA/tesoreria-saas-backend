import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  create(
    @Body()
    body: {
      email: string;
      password: string;
      name?: string;
      roleId?: string;
      roleCode?: string;
    },
  ) {
    return this.usersService.create(
      body.email,
      body.password,
      body.name,
      body.roleId,
      body.roleCode,
    );
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('role/:roleCode')
  findByRole(@Param('roleCode') roleCode: string) {
    return this.usersService.findByRole(roleCode);
  }
}
