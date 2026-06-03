import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PosConfig } from './entities/pos-config.entity';
import { Product } from './entities/product.entity';
import { PosCategory } from './entities/category.entity';

@Injectable()
export class PosService {
  constructor(
    @InjectRepository(PosConfig)
    private posConfigRepo: Repository<PosConfig>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(PosCategory)
    private categoryRepo: Repository<PosCategory>,
  ) {}

  async findByBranch(branchId: string) {
    return this.posConfigRepo.findOne({ where: { branchId } });
  }

  async create(data: Partial<PosConfig>) {
    const config = this.posConfigRepo.create(data);
    return this.posConfigRepo.save(config);
  }

  async update(id: string, data: Partial<PosConfig>) {
    await this.posConfigRepo.update(id, { ...data, updatedAt: new Date() });
    return this.posConfigRepo.findOne({ where: { id } });
  }

  async upsertByBranch(branchId: string, data: Partial<PosConfig>) {
    const existing = await this.findByBranch(branchId);
    if (existing) {
      return this.update(existing.id, data);
    }
    return this.create({ ...data, branchId });
  }

  async importProducts(productos: any[]) {
    const results = { success: 0, errors: [] as any[] };
    const categories = await this.categoryRepo.find({ where: { isActive: true } });

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

        // Create product
        const product = this.productRepo.create({
          name: row.nombre,
          categoryId: category.id,
          price: precio,
          imageUrl: row.imagenUrl || null,
          isActive: true,
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
