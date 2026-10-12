import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertSucursalDelTenant, assertSucursalLegible } from '../common/sucursal-efectiva';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PosConfig } from './entities/pos-config.entity';
import { Product } from './entities/product.entity';
import { PosCategory } from './entities/category.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Company } from '../companies/entities/company.entity';
import { isValidTasaIva, TASAS_IVA } from '../config/iva.config';

@Injectable()
export class PosService {
  constructor(
    @InjectRepository(PosConfig)
    private posConfigRepo: Repository<PosConfig>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(PosCategory)
    private categoryRepo: Repository<PosCategory>,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
  ) {}

  // Configuración del POS por sucursal. Con tenantId (el del token) la sucursal debe ser de ese tenant: antes se leía y
  // escribía la configuración de cualquier sucursal con solo conocer su id.
  async findByBranch(branchId: string, tenantId?: string) {
    if (tenantId) await assertSucursalLegible(this.posConfigRepo.manager, branchId, tenantId);
    return this.posConfigRepo.findOne({ where: { branchId } });
  }

  async create(data: Partial<PosConfig>, tenantId?: string) {
    if (tenantId) {
      if (!data?.branchId) throw new BadRequestException('Indica la sucursal de la configuración.');
      await assertSucursalDelTenant(this.posConfigRepo.manager, data.branchId, tenantId);
    }
    const config = this.posConfigRepo.create(data);
    return this.posConfigRepo.save(config);
  }

  async update(id: string, data: Partial<PosConfig>, tenantId?: string, userBranchId?: string | null) {
    if (tenantId) {
      const actual = await this.posConfigRepo.findOne({ where: { id } });
      if (!actual) throw new NotFoundException('Configuración no encontrada');
      await assertSucursalLegible(this.posConfigRepo.manager, actual.branchId, tenantId);
      if (userBranchId && actual.branchId !== userBranchId) throw new ForbiddenException('No tienes acceso a esa sucursal.');
      // La configuración no se reasigna de sucursal ni de id.
      const { branchId: _b, id: _i, ...resto } = data as any;
      data = resto;
    }
    await this.posConfigRepo.update(id, { ...data, updatedAt: new Date() });
    return this.posConfigRepo.findOne({ where: { id } });
  }

  async upsertByBranch(branchId: string, data: Partial<PosConfig>, tenantId?: string) {
    const existing = await this.findByBranch(branchId, tenantId);
    if (existing) {
      return this.update(existing.id, data);
    }
    return this.create({ ...data, branchId });
  }

  // Auditoría BUSINESS (hallazgo transversal #6, continuación): antes creaba los productos
  // sin tenantId (huérfanos) y buscaba categorías de TODOS los tenants por nombre. Ahora el
  // tenantId (del JWT) se asigna a cada producto y solo se consideran las categorías cuyas
  // sucursales pertenecen al tenant (branchId → Branch → Company.tenantId, mismo patrón de
  // dos saltos que categories.service.ts, porque PosCategory no tiene tenantId propio). Sin
  // tenant (SOPORTE) se rechaza: no hay a quién asignar los productos.
  //
  // Sucursal: cada producto queda en UNA sucursal (branchId) y su categoría se busca solo en esa sucursal (dos sucursales
  // pueden tener una categoría con el mismo nombre). La sucursal debe ser del tenant; si no se indica y el tenant tiene
  // una sola, se usa esa; con varias, hay que elegirla (400). `estacion` (COCINA | BARRA, opcional por fila) fija la
  // estacionPreparacion del producto; vacío = sin estación; cualquier otro valor es error de esa fila.
  async importProducts(productos: any[], tenantId?: string, branchIdElegida?: string) {
    if (!tenantId) {
      throw new BadRequestException('No se puede importar productos sin tenant.');
    }
    const results = { success: 0, errors: [] as any[], branchId: undefined as string | undefined, sinEstacion: 0 };
    const companies = await this.companyRepo.find({ where: { tenantId } });
    const branches = companies.length
      ? await this.branchRepo.find({ where: { companyId: In(companies.map(c => c.id)) } })
      : [];
    let branchId = branchIdElegida?.trim() || undefined;
    if (branchId) {
      if (!branches.some((b) => b.id === branchId)) throw new BadRequestException('Sucursal no encontrada.');
    } else if (branches.length === 1) {
      branchId = branches[0].id;
    } else {
      throw new BadRequestException('Indica la sucursal a la que se importan los productos (branchId).');
    }
    results.branchId = branchId;
    const categories = await this.categoryRepo.find({ where: { isActive: true, branchId: In([branchId]) } });

    for (let i = 0; i < productos.length; i++) {
      const row = productos[i];
      const rowNumber = i + 2; // +2 because header is row 1

      try {
        // Validate categoria exists
        const category = categories.find(c => c.name === row.categoria);
        if (!category) {
          results.errors.push({ row: rowNumber, message: `Categoría "${row.categoria}" no existe` });
          continue;
        }

        // Validate precio is a number
        const precio = parseFloat(row.precio);
        if (isNaN(precio)) {
          results.errors.push({ row: rowNumber, message: `precio debe ser un número válido` });
          continue;
        }

        const estacionRaw = String(row.estacion ?? row.estacionPreparacion ?? '').trim().toUpperCase();
        if (estacionRaw && estacionRaw !== 'COCINA' && estacionRaw !== 'BARRA') {
          results.errors.push({ row: rowNumber, message: `estacion debe ser COCINA o BARRA (llegó "${row.estacion ?? row.estacionPreparacion}")` });
          continue;
        }
        if (!estacionRaw) results.sinEstacion++;

        // Columna opcional `iva`: 16 | 8 | 0 | EXENTO. Vacía = usa la tasa del negocio.
        const ivaRaw = String(row.iva ?? row.tasaIva ?? '').trim().toUpperCase();
        if (ivaRaw && !isValidTasaIva(ivaRaw)) {
          results.errors.push({ row: rowNumber, message: `iva debe ser ${TASAS_IVA.join(', ')} o vacío (llegó "${row.iva ?? row.tasaIva}")` });
          continue;
        }

        // Create product
        const product = this.productRepo.create({
          name: row.nombre,
          categoryId: category.id,
          price: precio,
          imageUrl: row.imagenUrl || null,
          isActive: true,
          tenantId,
          branchId,
          ...(estacionRaw ? { estacionPreparacion: estacionRaw as 'COCINA' | 'BARRA' } : {}),
          ...(ivaRaw ? { tasaIva: ivaRaw } : {}),
        });

        await this.productRepo.save(product);
        results.success++;
      } catch (error) {
        results.errors.push({ row: rowNumber, message: error.message });
      }
    }

    return results;
  }
}
