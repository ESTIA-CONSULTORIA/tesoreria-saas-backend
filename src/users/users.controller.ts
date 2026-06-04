import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
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
  findAll(@Query('tenantId') tenantId?: string) {
    return this.usersService.findAll(tenantId);
  }

  @Get('email/:email')
  @Public()
  findByEmail(@Param('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get('role/:roleCode')
  findByRole(@Param('roleCode') roleCode: string, @Query('tenantId') tenantId?: string) {
    return this.usersService.findByRole(roleCode, tenantId);
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
