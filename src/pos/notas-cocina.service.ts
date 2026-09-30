import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotaCocina } from './entities/nota-cocina.entity';

// POS flexible, capacidad notas_cocina_barra. Lado de LECTURA/actualización de estado para
// la pantalla touch — la generación (escritura inicial) vive dentro de la transacción de
// SalesService.create(), no acá, a propósito (ver SalesService.generateNotasCocina()).
@Injectable()
export class NotasCocinaService {
  constructor(
    @InjectRepository(NotaCocina)
    private repo: Repository<NotaCocina>,
  ) {}

  // tenantId siempre del JWT (ver notas-cocina.controller.ts) — mismo patrón que el resto
  // del ERP tras la auditoría BUSINESS, aplicado aquí desde el día uno.
  findPending(tenantId: string, sucursalId?: string, estacion?: 'COCINA' | 'BARRA') {
    const where: any = { tenantId, estado: 'PENDIENTE' };
    if (sucursalId) where.sucursalId = sucursalId;
    if (estacion) where.estacion = estacion;
    return this.repo.find({ where, order: { createdAt: 'ASC' } });
  }

  async marcarPreparado(id: string, tenantId: string): Promise<NotaCocina | null> {
    const existing = await this.repo.findOne({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Nota de cocina no encontrada');
    }
    await this.repo.update(id, { estado: 'PREPARADO' });
    return this.repo.findOne({ where: { id } });
  }
}
