import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Table } from './entities/table.entity';

@Injectable()
export class TablesService {
  constructor(
    @InjectRepository(Table)
    private tablesRepo: Repository<Table>,
  ) {}

  // Aislamiento por tenant (capacidad mesas_cuenta_abierta): antes findAll() devolvía las
  // mesas de TODOS los tenants (nunca filtraba por tenant). tenantId opcional para no romper a
  // SOPORTE (sin tenantId en su JWT).
  findAll(branchId?: string, areaId?: string, tenantId?: string) {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (areaId) where.areaId = areaId;
    if (tenantId) where.tenantId = tenantId;
    
    return this.tablesRepo.find({
      where: Object.keys(where).length > 0 ? where : undefined,
      order: { number: 'ASC' },
    });
  }

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): findOne()/update()/delete()
  // no verificaban que la mesa perteneciera al tenant de quien llama — Table sí tiene
  // tenantId propio, mismo patrón que banks.service.ts. Opcional para no romper a SOPORTE.
  findOne(id: string, tenantId?: string) {
    return this.tablesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
  }

  // Mismo bug que tenía products.service.ts::create(): el tenantId salía del body (null si no
  // venía → mesa huérfana, invisible para su tenant e inutilizable para una cuenta abierta).
  // Ahora el controller resuelve req.user.tenantId || body.tenantId (fallback solo SOPORTE) y
  // aquí se impone; sin tenant se rechaza.
  create(data: Partial<Table>, tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('No se puede crear una mesa sin tenant.');
    }
    const table = this.tablesRepo.create({ ...data, tenantId });
    return this.tablesRepo.save(table);
  }

  async update(id: string, data: Partial<Table>, tenantId?: string) {
    const existing = await this.tablesRepo.findOne({ where: tenantId ? { id, tenantId } : { id } });
    if (!existing) throw new NotFoundException('Mesa no encontrada');
    // tenantId e id fuera del body: no se puede reasignar la mesa a otro tenant.
    const { tenantId: _ignoredTenantId, id: _ignoredId, ...safeData } = data as any;
    await this.tablesRepo.update(id, { ...safeData, updatedAt: new Date() });
    return this.tablesRepo.findOne({ where: { id } });
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      const existing = await this.tablesRepo.findOne({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Mesa no encontrada');
    }
    await this.tablesRepo.delete(id);
    return { deleted: true };
  }
}
