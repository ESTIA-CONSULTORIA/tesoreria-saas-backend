import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsumoAlert } from './entities/insumo-alert.entity';

@Injectable()
export class InsumoAlertsService {
  constructor(
    @InjectRepository(InsumoAlert)
    private repo: Repository<InsumoAlert>,
  ) {}

  getAlerts(tenantId: string) {
    return this.repo.find({
      where: [
        { tenantId, estado: 'proximo' },
        { tenantId, estado: 'agotado' },
      ],
      order: { updatedAt: 'DESC' },
    });
  }

  getAllAlerts(tenantId: string) {
    return this.repo.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });
  }

  async upsert(tenantId: string, companyId: string, userId: string, data: { nombre: string; tipo: string; estado: string; notas?: string }) {
    let alert = await this.repo.findOne({ where: { tenantId, companyId, nombre: data.nombre } });
    if (alert) {
      alert.estado = data.estado;
      alert.notas = data.notas || alert.notas;
      alert.reportadoPor = userId;
    } else {
      alert = this.repo.create({ tenantId, companyId, reportadoPor: userId, ...data });
    }
    return this.repo.save(alert);
  }

  async updateEstado(id: string, estado: string, notas?: string) {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new Error('No encontrado');
    alert.estado = estado;
    if (notas !== undefined) alert.notas = notas;
    return this.repo.save(alert);
  }
}
