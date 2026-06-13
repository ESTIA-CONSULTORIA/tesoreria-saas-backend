import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { HrDocument } from './entities/hr-document.entity';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(Employee)
    private readonly empRepo: Repository<Employee>,
    @InjectRepository(HrDocument)
    private readonly docRepo: Repository<HrDocument>,
  ) {}

  // --- Employees ---

  findAllEmployees(tenantId?: string, companyId?: string): Promise<Employee[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (companyId) where.companyId = companyId;
    return this.empRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    return this.empRepo.save(this.empRepo.create(data));
  }

  async updateEmployee(id: string, data: Partial<Employee>, tenantId?: string): Promise<Employee> {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    if (tenantId && emp.tenantId && emp.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso sobre este empleado');
    }
    await this.empRepo.update(id, data);
    return this.empRepo.findOne({ where: { id } }) as Promise<Employee>;
  }

  async removeEmployee(id: string, tenantId?: string): Promise<void> {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Empleado no encontrado');
    if (tenantId && emp.tenantId && emp.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes permiso sobre este empleado');
    }
    await this.empRepo.delete(id);
  }

  // --- Documents ---

  findDocsByEmployee(employeeId: string, tenantId?: string): Promise<HrDocument[]> {
    return this.docRepo.find({ where: { employeeId }, order: { uploadedAt: 'DESC' } });
  }

  async addDocument(employeeId: string, data: Partial<HrDocument>): Promise<HrDocument> {
    return this.docRepo.save(this.docRepo.create({ ...data, employeeId }));
  }

  async removeDocument(id: string): Promise<void> {
    await this.docRepo.delete(id);
  }
}
