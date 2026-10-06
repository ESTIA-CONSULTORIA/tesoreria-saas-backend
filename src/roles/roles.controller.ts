import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesService } from './roles.service';
import { Module } from './entities/permission.entity';
import { Public } from '../auth/public.decorator';

@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  // Antes sin guard: cualquier usuario autenticado (incluso un CAJERO) podía crear roles. Los roles son
  // globales (no por tenant), así que crear uno afecta a todos: solo ADMIN y SOPORTE.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SOPORTE')
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
    @Body() data: { canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean; subPermissions?: string[] },
  ) {
    return this.rolesService.updatePermission(roleId, module, data);
  }
}
