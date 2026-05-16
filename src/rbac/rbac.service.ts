import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRole } from './entities/user-role.entity';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,

    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,

    @InjectRepository(UserRole)
    private userRolesRepository: Repository<UserRole>,
  ) {}

  createRole(data: Partial<Role>) {
    const role = this.rolesRepository.create(data);
    return this.rolesRepository.save(role);
  }

  createPermission(data: Partial<Permission>) {
    const permission = this.permissionsRepository.create(data);
    return this.permissionsRepository.save(permission);
  }

  assignRole(data: Partial<UserRole>) {
    const assignment = this.userRolesRepository.create(data);
    return this.userRolesRepository.save(assignment);
  }

  findRoles() {
    return this.rolesRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  findPermissions() {
    return this.permissionsRepository.find({
      order: {
        module: 'ASC',
      },
    });
  }
}
