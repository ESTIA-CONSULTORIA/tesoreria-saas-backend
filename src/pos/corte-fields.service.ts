import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CorteField } from './entities/corte-field.entity';

const DEFAULT_FIELDS = [
  { key: 'efectivo',      label: 'Efectivo',      isActive: true,  resta: false, isRequired: true,  order: 0 },
  { key: 'tarjeta',       label: 'Tarjeta',       isActive: true,  resta: false, isRequired: false, order: 1 },
  { key: 'transferencia', label: 'Transferencia', isActive: true,  resta: false, isRequired: false, order: 2 },
  { key: 'cortesia',      label: 'Cortesías',     isActive: true,  resta: true,  isRequired: false, order: 3 },
  { key: 'descuento',     label: 'Descuentos',    isActive: true,  resta: true,  isRequired: false, order: 4 },
  { key: 'gasto',         label: 'Gastos',        isActive: true,  resta: true,  isRequired: false, order: 5 },
  { key: 'credito',       label: 'Crédito',       isActive: false, resta: false, isRequired: false, order: 6 },
  { key: 'compras',       label: 'Compras',       isActive: false, resta: true,  isRequired: false, order: 7 },
];

@Injectable()
export class CorteFieldsService {
  constructor(
    @InjectRepository(CorteField)
    private repo: Repository<CorteField>,
  ) {}

  async getFields(tenantId: string): Promise<CorteField[]> {
    let fields = await this.repo.find({ where: { tenantId }, order: { order: 'ASC' } });
    if (fields.length === 0) {
      fields = await this.repo.save(
        DEFAULT_FIELDS.map(f => this.repo.create({ ...f, tenantId })),
      );
    }
    return fields;
  }

  async updateField(tenantId: string, key: string, isActive: boolean): Promise<CorteField> {
    let field = await this.repo.findOne({ where: { tenantId, key } });
    if (!field) {
      const def = DEFAULT_FIELDS.find(f => f.key === key);
      if (!def) throw new Error('Campo no encontrado');
      field = await this.repo.save(this.repo.create({ ...def, tenantId }));
    }
    if (field.isRequired) return field;
    field.isActive = isActive;
    return this.repo.save(field);
  }
}
