import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../auth/public.decorator';

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
  @Public()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('email/:email')
  @Public()
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('role/:roleCode')
  findByRole(@Param('roleCode') roleCode: string) {
    return this.usersService.findByRole(roleCode);
  }

  @Put(':id')
  @Public()
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      roleId?: string;
      roleCode?: string;
      isActive?: boolean;
    },
  ) {
    return this.usersService.update(id, body);
  }
}
