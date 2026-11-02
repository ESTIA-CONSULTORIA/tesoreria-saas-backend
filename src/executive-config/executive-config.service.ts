import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutiveConfig } from './entities/executive-config.entity';

@Injectable()
export class ExecutiveConfigService {
  constructor(
    @InjectRepository(ExecutiveConfig)
    private repo: Repository<ExecutiveConfig>,
  ) {}

  // Con tenantId undefined, findOne({ where: { tenantId: undefined } }) NO filtra y devuelve la configuración de CUALQUIER negocio
  // (y upsert la modificaba): sin tenant no hay configuración.
  async findByTenant(tenantId: string) {
    if (!tenantId) return null;
    return this.repo.findOne({ where: { tenantId } });
  }

  async upsert(tenantId: string, body: { theme?: string; modules?: Record<string, boolean> }) {
    if (!tenantId) throw new BadRequestException('Falta el negocio');
    // Solo estos campos: antes update(existing.id, body) aceptaba cualquiera (id, tenantId...)
    const permitido: { theme?: string; modules?: Record<string, boolean> } = {};
    if (body?.theme !== undefined) permitido.theme = body.theme;
    if (body?.modules !== undefined) permitido.modules = body.modules;
    body = permitido;
    const existing = await this.findByTenant(tenantId);
    if (!existing) {
      const created = this.repo.create({
        tenantId,
        theme: body.theme || 'dark',
        modules: body.modules || {},
      });
      return this.repo.save(created);
    }

    await this.repo.update(existing.id, body);
    return this.findByTenant(tenantId);
  }
}
