import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { assertSucursalDelTenant } from '../common/sucursal-efectiva';
import { PosCategory } from './entities/category.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';

/** Aislamiento de categorías (PosCategory no tiene tenantId): con sucursal, solo las de sucursales del tenant; sin sucursal, solo las que el tenant usa. */
export function categoriasVisibles<T extends { id: string; branchId?: string | null }>(
  rows: T[],
  ctx: { branchIdsTenant: Set<string>; usedIds: Set<string>; branchId?: string },
): T[] {
  return rows.filter((c) => {
    if (c.branchId) {
      return ctx.branchIdsTenant.has(c.branchId) && (!ctx.branchId || c.branchId === ctx.branchId);
    }
    return ctx.usedIds.has(c.id);
  });
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(PosCategory)
    private categoriesRepo: Repository<PosCategory>,
    @InjectRepository(Branch)
    private branchesRepo: Repository<Branch>,
    @InjectRepository(Company)
    private companiesRepo: Repository<Company>,
  ) {}

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): PosCategory no tiene
  // tenantId propio — la pertenencia se resuelve vía branchId → Branch → Company.tenantId,
  // mismo patrón de dos saltos que branches.service.ts::findOwnedBranch(). Opcional para no
  // romper a SOPORTE.
  private async findOwnedCategory(id: string, tenantId?: string): Promise<PosCategory | null> {
    const category = await this.categoriesRepo.findOne({ where: { id } });
    if (!category) return null;
    if (!tenantId) return category;
    if (!category.branchId) return null;
    const branch = await this.branchesRepo.findOne({ where: { id: category.branchId } });
    if (!branch) return null;
    const company = await this.companiesRepo.findOne({ where: { id: branch.companyId, tenantId } });
    if (!company) return null;
    return category;
  }

  // Categorías visibles para un tenant:
  //   · con sucursal: las de las sucursales de ESE tenant (branch → company → tenant);
  //   · sin sucursal (branchId NULL): solo las que al menos un producto de ESE tenant usa. Una categoría NULL no tiene tenant
  //     propio, así que nunca se lista a un tenant que no la use (ver categoriasVisibles).
  // `branchId` (sucursal efectiva) acota las que tienen sucursal a esa; las compartidas que el tenant usa se agregan siempre.
  async findAll(branchId?: string, tenantId?: string) {
    const query = this.categoriesRepo.createQueryBuilder('category');

    let ctx: { branchIdsTenant: Set<string>; usedIds: Set<string>; branchId?: string } | null = null;
    if (tenantId) {
      const companies = await this.companiesRepo.find({ where: { tenantId } });
      const branches = companies.length ? await this.branchesRepo.find({ where: { companyId: In(companies.map((c) => c.id)) } }) : [];
      const branchIdsTenant = new Set(branches.map((b) => b.id));
      const usadas = await this.categoriesRepo.manager.query(
        'SELECT DISTINCT "categoryId" FROM "product" WHERE "tenantId"::text = $1 AND "categoryId" IS NOT NULL',
        [tenantId],
      );
      const usedIds = new Set<string>((usadas as Array<{ categoryId: string }>).map((r) => String(r.categoryId)));
      ctx = { branchIdsTenant, usedIds, branchId };
      // Candidatas: las de sus sucursales y las sin sucursal (estas últimas se filtran por uso en categoriasVisibles).
      if (branchIdsTenant.size > 0) {
        query.andWhere('(category.branchId IN (:...branchIdsTenant) OR category.branchId IS NULL)', { branchIdsTenant: [...branchIdsTenant] });
      } else {
        query.andWhere('category.branchId IS NULL');
      }
    } else if (branchId) {
      query.andWhere('category.branchId = :branchId', { branchId });
    }

    // Subquery para contar productos por categoría
    query.loadRelationCountAndMap('category.productCount', 'category.products', 'product');

    query.orderBy('category.order', 'ASC').addOrderBy('category.name', 'ASC');

    const rows = await query.getMany();
    return ctx ? categoriasVisibles(rows, ctx) : rows;
  }

  findOne(id: string, tenantId?: string) {
    return this.findOwnedCategory(id, tenantId);
  }

  // La sucursal ya viene resuelta por el controller (sucursal efectiva); con tenant se valida que sea del tenant. Sin sucursal
  // la categoría queda compartida (NULL): no tiene tenant propio y solo se lista a quien la use con sus productos.
  async create(data: Partial<PosCategory>, tenantId?: string) {
    if (tenantId) await assertSucursalDelTenant(this.categoriesRepo.manager, data?.branchId, tenantId);
    const category = this.categoriesRepo.create(data);
    return this.categoriesRepo.save(category);
  }

  async update(id: string, data: Partial<PosCategory>, tenantId?: string) {
    const existing = await this.findOwnedCategory(id, tenantId);
    if (!existing) throw new NotFoundException('Categoría no encontrada');
    await this.categoriesRepo.update(id, { ...data, updatedAt: new Date() });
    return this.categoriesRepo.findOne({ where: { id } });
  }

  async delete(id: string, tenantId?: string) {
    const existing = await this.findOwnedCategory(id, tenantId);
    if (!existing) throw new NotFoundException('Categoría no encontrada');
    await this.categoriesRepo.delete(id);
    return { deleted: true };
  }
}
