import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantSetting } from './entities/tenant-setting.entity';
import { Repository } from 'typeorm';
import { DEFAULT_POS_CAPABILITIES, PosCapability } from '../config/pos-capabilities.config';
import { PoliticaDevolucion } from '../config/politica-devoluciones.config';
import { isValidPoliticaValor, POLITICA_KEYS, POLITICAS_POS, PoliticaKey, PoliticaCobro, PoliticaDivision } from '../config/politicas-pos.config';

@Injectable()
export class TenantSettingsService {
  constructor(
    @InjectRepository(TenantSetting)
    private repo: Repository<TenantSetting>,
  ) {}

  findByTenant(tenantId: string) {
    return this.repo.findOne({ where: { tenantId } });
  }

  // POS flexible: consulta desde backend para que cualquier capacidad futura pueda
  // preguntar "¿este tenant la tiene activa?" sin ir por HTTP. posCapabilities solo guarda
  // EXCEPCIONES al default (ver comentario en la entidad y en upsert()) — si el tenant no
  // tiene fila de settings, o la tiene pero nunca tocó esta capacidad puntual, cae al
  // default del catálogo (DEFAULT_POS_CAPABILITIES), que es exactamente el comportamiento
  // actual del POS para venta_directa_producto (true) sin necesitar backfill de datos.
  async hasPosCapability(tenantId: string, capability: PosCapability): Promise<boolean> {
    const setting = await this.findByTenant(tenantId);
    const stored = setting?.posCapabilities?.[capability];
    if (typeof stored === 'boolean') {
      return stored;
    }
    return DEFAULT_POS_CAPABILITIES[capability];
  }

  // Política del tenant (devoluciones, cobro, división de cuentas). Sin fila, sin clave o con un valor no
  // reconocido cae al default (el más restrictivo en todas): nadie queda con permiso de más por un dato raro.
  async getPolitica(tenantId: string, key: PoliticaKey): Promise<string> {
    const setting = await this.findByTenant(tenantId);
    const stored = setting?.posCapabilities?.[key];
    return isValidPoliticaValor(key, stored) ? stored : POLITICAS_POS[key].default;
  }

  async getPoliticaDevoluciones(tenantId: string): Promise<PoliticaDevolucion> {
    return (await this.getPolitica(tenantId, 'politicaDevoluciones')) as PoliticaDevolucion;
  }

  async getPoliticaCobro(tenantId: string): Promise<PoliticaCobro> {
    return (await this.getPolitica(tenantId, 'politicaCobro')) as PoliticaCobro;
  }

  async getPoliticaDivisionCuentas(tenantId: string): Promise<PoliticaDivision> {
    return (await this.getPolitica(tenantId, 'politicaDivisionCuentas')) as PoliticaDivision;
  }

  async upsert(
    tenantId: string,
    body: {
      name?: string;
      logoUrl?: string;
      faviconUrl?: string;
      backgroundImage?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      fontFamily?: string;
      fontSize?: number;
      sidebarColor?: string;
      sidebarTextColor?: string;
      sidebarActiveColor?: string;
      sidebarStyle?: 'compact' | 'normal' | 'expanded';
      primaryButtonColor?: string;
      secondaryButtonColor?: string;
      buttonBorderRadius?: 'square' | 'rounded' | 'pill';
      customCSS?: string;
      splashBg?: string;
      theme?: string;
      companyDisplayName?: string;
      stockPolicy?: 'BLOQUEAR' | 'PERMITIR_NEGATIVO';
      posCapabilities?: Partial<Record<PosCapability, boolean>>;
      politicaDevoluciones?: string;
      politicaCobro?: string;
      politicaDivisionCuentas?: string;
    },
  ) {
    const existing = await this.findByTenant(tenantId);

    // Las políticas (politicaDevoluciones, politicaCobro, politicaDivisionCuentas) no son columnas: se guardan
    // dentro de posCapabilities (JSON). Pueden llegar como campo propio o dentro de posCapabilities; en ambos
    // casos se validan aquí, así que ningún valor inválido llega a la fila por ninguna vía (PUT, POST ni
    // posCapabilities).
    const politicas: Record<string, string> = {};
    const bodyLibre: Record<string, any> = { ...body };
    const capsLibres: Record<string, any> = { ...((body.posCapabilities as Record<string, any>) || {}) };
    for (const key of POLITICA_KEYS) {
      const valor = bodyLibre[key] !== undefined ? bodyLibre[key] : capsLibres[key];
      delete bodyLibre[key];
      delete capsLibres[key];
      if (valor === undefined) continue;
      if (!isValidPoliticaValor(key, valor)) {
        throw new BadRequestException(`${key} inválida: usa ${POLITICAS_POS[key].valores.join(' o ')}.`);
      }
      politicas[key] = valor;
    }
    const hayPoliticas = Object.keys(politicas).length > 0;
    body = { ...bodyLibre, ...(body.posCapabilities !== undefined ? { posCapabilities: capsLibres } : {}) } as typeof body;

    // Merge, nunca reemplazo: posCapabilities solo guarda excepciones al default (ver
    // comentario en la entidad), así que activar/desactivar UNA capacidad no debe borrar
    // las otras 4 que ya estaban guardadas explícitamente en la fila. body.posCapabilities
    // es parcial a propósito (puede traer solo la capacidad que el panel está tocando).
    const mergedCapabilities =
      body.posCapabilities !== undefined || hayPoliticas
        ? {
            ...(existing?.posCapabilities || {}),
            ...(body.posCapabilities || {}),
            ...politicas,
          }
        : undefined;

    if (!existing) {
      const created = this.repo.create({
        tenantId,
        name: body.name,
        logoUrl: body.logoUrl,
        faviconUrl: body.faviconUrl,
        backgroundImage: body.backgroundImage,
        primaryColor: body.primaryColor || '#2563eb',
        secondaryColor: body.secondaryColor || '#64748b',
        accentColor: body.accentColor || '#0ea5e9',
        fontFamily: body.fontFamily || 'Inter',
        fontSize: body.fontSize || 16,
        sidebarColor: body.sidebarColor || '#0f172a',
        sidebarTextColor: body.sidebarTextColor || '#e2e8f0',
        sidebarActiveColor: body.sidebarActiveColor || '#2563eb',
        sidebarStyle: body.sidebarStyle || 'normal',
        primaryButtonColor: body.primaryButtonColor || '#2563eb',
        secondaryButtonColor: body.secondaryButtonColor || '#64748b',
        buttonBorderRadius: body.buttonBorderRadius || 'rounded',
        customCSS: body.customCSS,
        stockPolicy: body.stockPolicy || 'PERMITIR_NEGATIVO',
        posCapabilities: mergedCapabilities ?? null,
      });
      return this.repo.save(created);
    }

    const updatePayload = mergedCapabilities !== undefined ? { ...body, posCapabilities: mergedCapabilities } : body;
    await this.repo.update(existing.id, updatePayload);
    return this.findByTenant(tenantId);
  }

  async getDefaults() {
    return {
      name: '',
      logoUrl: '',
      faviconUrl: '',
      primaryColor: '#2563eb',
      secondaryColor: '#64748b',
      accentColor: '#0ea5e9',
      fontFamily: 'Inter',
      fontSize: 16,
      sidebarColor: '#0f172a',
      sidebarTextColor: '#e2e8f0',
      sidebarActiveColor: '#2563eb',
      sidebarStyle: 'normal',
      primaryButtonColor: '#2563eb',
      secondaryButtonColor: '#64748b',
      buttonBorderRadius: 'rounded',
    };
  }
}
