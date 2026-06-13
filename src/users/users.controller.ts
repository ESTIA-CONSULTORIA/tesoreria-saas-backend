import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request } from '@nestjs/common';
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
      tenantId?: string;
      companyId?: string;
      branchId?: string;
    },
    @Request() req?: any,
  ) {
    const tenantId = body.tenantId || req?.user?.tenantId;
    const companyId = body.companyId || req?.user?.companyId;
    const branchId = body.branchId || req?.user?.branchId;
    return this.usersService.create(
      body.email,
      body.password,
      body.name,
      body.roleId,
      body.roleCode,
      tenantId,
      companyId,
      branchId,
    );
  }

  @Get()
  findAll(@Query('tenantId') queryTenantId?: string, @Request() req?: any) {
    const tenantId = req?.user?.tenantId || queryTenantId;
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
