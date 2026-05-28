import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Module } from './entities/permission.entity';
import { Public } from '../auth/public.decorator';

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
  @Public()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('code/:code')
  @Public()
  findByCode(@Param('code') code: string) {
    return this.rolesService.findByCode(code);
  }

  @Post('initialize-default')
  @Public()
  initializeDefaultRoles() {
    return this.rolesService.initializeDefaultRoles();
  }

  @Put(':roleId/permissions/:module')
  updatePermission(
    @Param('roleId') roleId: string,
    @Param('module') module: Module,
    @Body() data: { canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean },
  ) {
    return this.rolesService.updatePermission(roleId, module, data);
  }
}
