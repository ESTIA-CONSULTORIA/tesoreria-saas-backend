import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private rolesRepository: Repository<Role>,
  ) {}

  create(code: string, name: string, description?: string) {
    const role = this.rolesRepository.create({
      code,
      name,
      description,
      isActive: true,
    });

    return this.rolesRepository.save(role);
  }

  findAll() {
    return this.rolesRepository.find({
      order: { name: 'ASC' },
    });
  }

  findByCode(code: string) {
    return this.rolesRepository.findOne({
      where: { code },
    });
  }
}
