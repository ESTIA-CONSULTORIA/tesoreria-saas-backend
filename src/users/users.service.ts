import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(
    email: string,
    password: string,
    name?: string,
    roleId?: string,
    roleCode?: string,
    tenantId?: string,
    companyId?: string,
    branchId?: string,
    executivePin?: string,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPin = executivePin ? await bcrypt.hash(executivePin, 10) : undefined;
    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      name,
      roleId,
      roleCode: roleCode || 'USER',
      isActive: true,
      tenantId,
      companyId,
      branchId,
      executivePin: hashedPin,
    });
    return this.usersRepository.save(user);
  }

  findByEmail(email: string) {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect(['user.password'])
      .where('user.email = :email', { email })
      .getOne();
  }

  findAll(tenantId?: string) {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.roleId',
        'user.roleCode',
        'user.tenantId',
        'user.companyId',
        'user.branchId',
        'user.isActive',
      ])
      .orderBy('user.email', 'ASC');

    if (tenantId) qb.where('user.tenantId = :tenantId', { tenantId });

    return qb.getMany();
  }

  findAllWithPins(tenantId?: string) {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.name',
        'user.roleId',
        'user.roleCode',
        'user.tenantId',
        'user.companyId',
        'user.branchId',
        'user.isActive',
      ])
      .addSelect(['user.executivePin'])
      .orderBy('user.email', 'ASC');

    if (tenantId) qb.where('user.tenantId = :tenantId', { tenantId });

    return qb.getMany();
  }

  findByRole(roleCode: string, tenantId?: string) {
    const where: any = { roleCode };
    if (tenantId) where.tenantId = tenantId;
    return this.usersRepository.find({
      where,
      order: { email: 'ASC' },
    });
  }

  async update(id: string, data: { name?: string; roleId?: string; roleCode?: string; isActive?: boolean; executivePin?: string; password?: string }) {
    const toSave = { ...data };
    if (toSave.password) {
      toSave.password = await bcrypt.hash(toSave.password, 10);
    }
    if (toSave.executivePin) {
      toSave.executivePin = await bcrypt.hash(toSave.executivePin, 10);
    }
    await this.usersRepository.update(id, toSave);
    return this.usersRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.usersRepository.delete(id);
  }
}