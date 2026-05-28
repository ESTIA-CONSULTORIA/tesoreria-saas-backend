import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission, Module } from './entities/permission.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,
  ) {}

  async create(code: string, name: string, description?: string) {
    const role = this.rolesRepository.create({
      code,
      name,
      description,
      isActive: true,
    });

    const savedRole = await this.rolesRepository.save(role);

    // Crear permisos por defecto para todos los módulos
    const modules = Object.values(Module);
    const permissions = modules.map((module) =>
      this.permissionsRepository.create({
        module,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        roleId: savedRole.id,
      }),
    );

    await this.permissionsRepository.save(permissions);

    return this.rolesRepository.findOne({
      where: { id: savedRole.id },
      relations: ['permissions'],
    });
  }

  findAll() {
    return this.rolesRepository.find({
      order: { name: 'ASC' },
      relations: ['permissions'],
    });
  }

  findByCode(code: string) {
    return this.rolesRepository.findOne({
      where: { code },
      relations: ['permissions'],
    });
  }

  async updatePermission(roleId: string, module: Module, data: { canView?: boolean; canCreate?: boolean; canEdit?: boolean; canDelete?: boolean }) {
    const permission = await this.permissionsRepository.findOne({
      where: { roleId, module },
    });

    if (!permission) {
      throw new Error('Permiso no encontrado');
    }

    Object.assign(permission, data);
    return this.permissionsRepository.save(permission);
  }

  async initializeDefaultRoles() {
    const defaultRoles = [
      { code: 'SUPER_ADMIN', name: 'Super Administrador', description: 'Acceso total al sistema' },
      { code: 'ADMIN', name: 'Administrador', description: 'Acceso administrativo' },
      { code: 'CONTADOR', name: 'Contador', description: 'Acceso a contabilidad y reportes' },
      { code: 'CAJERO', name: 'Cajero', description: 'Acceso a movimientos y tesorería' },
      { code: 'VIEWER', name: 'Visualizador', description: 'Solo lectura' },
    ];

    for (const roleData of defaultRoles) {
      const existing = await this.rolesRepository.findOne({
        where: { code: roleData.code },
      });

      if (!existing) {
        await this.create(roleData.code, roleData.name, roleData.description);
      }
    }

    return this.findAll();
  }
}
