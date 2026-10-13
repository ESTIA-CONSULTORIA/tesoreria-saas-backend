import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Supplier } from './entities/supplier.entity';
import { Purchase } from '../purchases/entities/purchase.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private suppliersRepo: Repository<Supplier>,
    @InjectRepository(Purchase)
    private purchasesRepo: Repository<Purchase>,
  ) {}

  findAll(tenantId?: string, search?: string, isActive?: boolean, companyId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.nombre = Like(`%${search}%`);
    }
    // Suppliers are tenant-level entities, companyId is ignored for now
    // as suppliers are typically shared across companies within a tenant

    return this.suppliersRepo.find({
      where,
      order: { nombre: 'ASC' },
    });
  }

  // Con tenantId (el del token; undefined = SOPORTE) solo se toca un proveedor de ese tenant; una id ajena es 404.
  private async assertProveedor(id: string, tenantId?: string) {
    if (!tenantId) return;
    const p = await this.suppliersRepo.findOne({ where: { id, tenantId } as any });
    if (!p) throw new NotFoundException('Proveedor no encontrado');
  }

  async findOne(id: string, tenantId?: string) {
    await this.assertProveedor(id, tenantId);
    return this.suppliersRepo.findOne({ where: { id } });
  }

  // Recomendación #4 (seguimiento auditoría BUSINESS): GET /suppliers/:id/purchases era un
  // stub que siempre devolvía [] — Purchase ya tiene supplierId y tenantId propios, así que
  // filtrar por ambos alcanza: un supplierId de OTRO tenant nunca puede coincidir con una
  // fila cuyo tenantId sea el del que llama, sin necesitar una verificación de pertenencia
  // aparte sobre el proveedor.
  findPurchasesBySupplier(supplierId: string, tenantId?: string) {
    const where: any = { supplierId };
    if (tenantId) where.tenantId = tenantId;
    return this.purchasesRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  create(data: Partial<Supplier>) {
    const supplier = this.suppliersRepo.create(data);
    return this.suppliersRepo.save(supplier);
  }

  async update(id: string, data: Partial<Supplier>, tenantId?: string) {
    await this.assertProveedor(id, tenantId);
    delete (data as any).tenantId;
    delete (data as any).id;
    await this.suppliersRepo.update(id, { ...data, updatedAt: new Date() });
    return this.suppliersRepo.findOne({ where: { id } });
  }

  async softDelete(id: string, tenantId?: string) {
    await this.assertProveedor(id, tenantId);
    await this.suppliersRepo.update(id, { isActive: false, updatedAt: new Date() });
  }

  async delete(id: string, tenantId?: string) {
    await this.assertProveedor(id, tenantId);
    await this.suppliersRepo.delete(id);
  }
}
