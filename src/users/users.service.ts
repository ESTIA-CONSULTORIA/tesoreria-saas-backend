import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  create(
    email: string,
    password: string,
    name?: string,
    roleId?: string,
    roleCode?: string,
    tenantId?: string,
    companyId?: string,
    branchId?: string,
  ) {
    const user = this.usersRepository.create({
      email,
      password,
      name,
      roleId,
      roleCode: roleCode || 'USER',
      isActive: true,
      tenantId,
      companyId,
      branchId,
    });
    return this.usersRepository.save(user);
  }

  findByEmail(email: string) {
    return this.usersRepository.findOne({ where: { email } });
  }

  findAll(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.usersRepository.find({
      where,
      order: { email: 'ASC' },
    });
  }

  findByRole(roleCode: string, tenantId?: string) {
    const where: any = { roleCode };
    if (tenantId) where.tenantId = tenantId;
    return this.usersRepository.find({
      where,
      order: { email: 'ASC' },
    });
  }

  async update(id: string, data: { name?: string; roleId?: string; roleCode?: string; isActive?: boolean }) {
    await this.usersRepository.update(id, data);
    return this.usersRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.usersRepository.delete(id);
  }
}