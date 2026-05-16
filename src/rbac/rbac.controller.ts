import { Body, Controller, Get, Post } from '@nestjs/common';

import { RbacService } from './rbac.service';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRole } from './entities/user-role.entity';

@Controller('rbac')
export class RbacController {
  constructor(private rbacService: RbacService) {}

  @Post('roles')
  createRole(@Body() body: Partial<Role>) {
    return this.rbacService.createRole(body);
  }

  @Post('permissions')
  createPermission(@Body() body: Partial<Permission>) {
    return this.rbacService.createPermission(body);
  }

  @Post('assign-role')
  assignRole(@Body() body: Partial<UserRole>) {
    return this.rbacService.assignRole(body);
  }

  @Get('roles')
  findRoles() {
    return this.rbacService.findRoles();
  }

  @Get('permissions')
  findPermissions() {
    return this.rbacService.findPermissions();
  }
}
