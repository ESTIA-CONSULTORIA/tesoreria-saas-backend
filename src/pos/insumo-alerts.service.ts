import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsumoAlert } from './entities/insumo-alert.entity';
import { Insumo } from '../costs/entities/insumo.entity';

@Injectable()
export class InsumoAlertsService {
  constructor(
    @InjectRepository(InsumoAlert)
    private repo: Repository<InsumoAlert>,
    @InjectRepository(Insumo)
    private insumoRepo: Repository<Insumo>,
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

  // Catálogo ligero para el selector de CorteCajaLite.tsx — sin el gate de
  // @Modulo('costos') (BOCATTA, ej., no tiene ese módulo activo pero sí puede tener
  // insumos reales cargados; confirmado que la tabla insumo no depende del estado del
  // módulo, solo el acceso vía CostsController). Solo id/nombre, nunca costos ni precios.
  listInsumosLigero(tenantId: string) {
    return this.insumoRepo.find({
      where: { tenantId, isActive: true },
      select: ['id', 'nombre'],
      order: { nombre: 'ASC' },
    });
  }

  async upsert(tenantId: string, companyId: string, userId: string, data: { nombre: string; tipo: string; estado: string; notas?: string; insumoId?: string }) {
    // Deduplicación: si viene insumoId, es la clave preferida (vínculo real). Si no hay
    // match por insumoId (o no vino), cae al camino legacy por nombre — así una alerta
    // vieja creada a mano (sin insumoId) se actualiza en vez de duplicarse, y de paso
    // queda con el insumoId ya relleno para la próxima vez.
    let alert: InsumoAlert | null = null;
    if (data.insumoId) {
      alert = await this.repo.findOne({ where: { tenantId, companyId, insumoId: data.insumoId } });
    }
    if (!alert) {
      alert = await this.repo.findOne({ where: { tenantId, companyId, nombre: data.nombre } });
    }

    if (alert) {
      alert.estado = data.estado;
      alert.notas = data.notas || alert.notas;
      alert.reportadoPor = userId;
      if (data.insumoId) alert.insumoId = data.insumoId;
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
