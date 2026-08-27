import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
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
    if (tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      if (tenant?.plan?.startsWith('LITE')) {
        const count = await this.usersRepository.count({ where: { tenantId } });
        if (count >= 3) {
          throw new BadRequestException('El plan LITE permite máximo 3 usuarios');
        }
      }
    }

    // Auditoría de seguridad (GoodsHabits): un CAJERO/GERENTE sin companyId/branchId
    // reales rompe el aislamiento por sucursal — products/areas/categories.service.ts
    // no filtran si branchId llega vacío (devuelven TODAS las sucursales del tenant), y
    // sales.service.ts exige sucursalId para registrar una venta. No aplica a SOPORTE ni
    // otros roles porque no operan sobre datos scoped a una sucursal específica.
    this.assertCompanyBranchIfRequired(roleCode, companyId, branchId);

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

  async update(id: string, data: { name?: string; roleId?: string; roleCode?: string; isActive?: boolean; executivePin?: string; password?: string; branchId?: string }) {
    // companyId a propósito NO es parte de este método — ver updateCompany() (SOPORTE-only,
    // endpoint separado). El roleCode SÍ se puede cambiar aquí (ya era así antes), así que
    // hay que validar el estado FINAL (existente + lo que llega), no solo lo que llega en
    // este request — alguien podría pasar un CAJERO/GERENTE existente sin tocar branchId,
    // o cambiarle el rol a GERENTE a un usuario que nunca tuvo companyId/branchId.
    const existing = await this.usersRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`No existe un usuario con id '${id}'`);

    const finalRoleCode = data.roleCode ?? existing.roleCode;
    const finalCompanyId = existing.companyId; // no editable desde acá
    const finalBranchId = data.branchId !== undefined ? data.branchId : existing.branchId;
    this.assertCompanyBranchIfRequired(finalRoleCode, finalCompanyId, finalBranchId);

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

  // SOPORTE-only (ver @Roles('SOPORTE') en users.controller.ts) — casos de corrección,
  // no un flujo normal de edición. Re-valida la regla CAJERO/GERENTE con el branchId
  // actual del usuario: cambiar de empresa sin ajustar la sucursal puede dejar un
  // branchId que ya no pertenece a la empresa nueva — esa consistencia queda fuera de
  // este chequeo (branchId sigue siendo responsabilidad del admin normal vía update()),
  // esto solo evita dejar companyId vacío en un CAJERO/GERENTE.
  async updateCompany(id: string, companyId: string) {
    const existing = await this.usersRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`No existe un usuario con id '${id}'`);

    this.assertCompanyBranchIfRequired(existing.roleCode, companyId, existing.branchId);

    await this.usersRepository.update(id, { companyId });
    return this.usersRepository.findOne({ where: { id } });
  }

  async remove(id: string) {
    await this.usersRepository.delete(id);
  }

  private assertCompanyBranchIfRequired(roleCode?: string, companyId?: string, branchId?: string) {
    if ((roleCode === 'CAJERO' || roleCode === 'GERENTE') && (!companyId || !branchId)) {
      throw new BadRequestException(
        `Los usuarios ${roleCode} requieren empresa y sucursal asignadas.`,
      );
    }
  }
}