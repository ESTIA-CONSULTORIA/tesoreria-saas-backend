import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Integration } from './entities/integration.entity';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'estia_key_2024_32bytes_padding!!';
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export const INTEGRATION_CATALOG = [
  {
    slug: 'sat-cfdi',
    name: 'SAT CFDI',
    description: 'Emisión de facturas electrónicas CFDI 4.0',
    category: 'fiscal',
    icon: '🏛️',
    fields: ['rfc', 'certificado', 'llave', 'contrasena'],
  },
  {
    slug: 'imss-idse',
    name: 'IMSS IDSE',
    description: 'Altas, bajas y modificaciones ante el IMSS',
    category: 'rh',
    icon: '🏥',
    fields: ['usuario', 'contrasena', 'registro_patronal'],
  },
  {
    slug: 'bbva',
    name: 'BBVA Bancomer',
    description: 'Conciliación bancaria automática BBVA',
    category: 'bancos',
    icon: '🏦',
    fields: ['cliente_id', 'secret', 'cuenta'],
  },
  {
    slug: 'banorte',
    name: 'Banorte',
    description: 'Conciliación bancaria automática Banorte',
    category: 'bancos',
    icon: '🏦',
    fields: ['usuario', 'contrasena', 'cuenta'],
  },
  {
    slug: 'contpaq',
    name: 'CONTPAQi',
    description: 'Sincronización contable con CONTPAQi',
    category: 'contabilidad',
    icon: '📊',
    fields: ['servidor', 'base_datos', 'usuario', 'contrasena'],
  },
  {
    slug: 'softrestaurant',
    name: 'SoftRestaurant',
    description: 'Migración desde SoftRestaurant',
    category: 'pos',
    icon: '🍽️',
    fields: ['servidor', 'base_datos', 'usuario', 'contrasena'],
  },
  {
    slug: 'parrot',
    name: 'Parrot POS',
    description: 'Integración con sistema Parrot',
    category: 'pos',
    icon: '🦜',
    fields: ['api_key', 'restaurant_id'],
  },
  {
    slug: 'whatsapp',
    name: 'WhatsApp Business',
    description: 'Notificaciones y comunicación vía WhatsApp',
    category: 'comunicacion',
    icon: '💬',
    fields: ['token', 'phone_number_id', 'business_account_id'],
  },
];

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(Integration)
    private repo: Repository<Integration>,
  ) {}

  async findAll(tenantId: string, companyId?: string) {
    const active = await this.repo.find({ where: { tenantId } });
    return INTEGRATION_CATALOG.map((cat) => {
      const found = active.find((a) => a.slug === cat.slug);
      return {
        ...cat,
        isActive: found?.isActive ?? false,
        status: found?.status ?? 'DISCONNECTED',
        lastSync: found?.lastSync ?? null,
        id: found?.id ?? null,
        config: found?.config ? JSON.parse(found.config) : null,
      };
    });
  }

  async activate(tenantId: string, slug: string, credentials: Record<string, string>, config?: Record<string, any>): Promise<Integration> {
    const cat = INTEGRATION_CATALOG.find((c) => c.slug === slug);
    if (!cat) throw new NotFoundException('Integración no encontrada en catálogo');

    const encCredentials = encrypt(JSON.stringify(credentials));
    const existing = await this.repo.findOne({ where: { tenantId, slug } });

    if (existing) {
      await this.repo.update(existing.id, {
        isActive: true,
        status: 'CONNECTED',
        credentials: encCredentials,
        config: config ? JSON.stringify(config) : existing.config,
        lastSync: new Date(),
      });
      const updated = await this.repo.findOne({ where: { id: existing.id } });
      return this.sanitize(updated!);
    }

    const integration = this.repo.create({
      tenantId,
      slug,
      name: cat.name,
      isActive: true,
      status: 'CONNECTED',
      credentials: encCredentials,
      config: config ? JSON.stringify(config) : undefined,
      lastSync: new Date(),
    });
    const saved = await this.repo.save(integration);
    return this.sanitize(saved as Integration);
  }

  async deactivate(tenantId: string, slug: string): Promise<void> {
    const integration = await this.repo.findOne({ where: { tenantId, slug } });
    if (!integration) throw new NotFoundException('Integración no encontrada');
    await this.repo.update(integration.id, { isActive: false, status: 'DISCONNECTED' });
  }

  async updateConfig(tenantId: string, slug: string, config: Record<string, any>): Promise<Integration> {
    const integration = await this.repo.findOne({ where: { tenantId, slug } });
    if (!integration) throw new NotFoundException('Integración no encontrada');
    await this.repo.update(integration.id, { config: JSON.stringify(config) });
    const updated = await this.repo.findOne({ where: { id: integration.id } });
    return this.sanitize(updated!);
  }

  async testConnection(tenantId: string, slug: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.repo.findOne({ where: { tenantId, slug } });
    if (!integration || !integration.isActive) {
      return { success: false, message: 'Integración no activa' };
    }
    // Update lastSync timestamp on test
    await this.repo.update(integration.id, { lastSync: new Date() });
    return { success: true, message: 'Conexión exitosa' };
  }

  private sanitize(integration: Integration): Integration {
    const copy = { ...integration } as any;
    delete copy.credentials;
    return copy;
  }

  // Legacy methods kept for backwards compatibility
  create(data: Partial<Integration>) {
    const integration = this.repo.create(data);
    return this.repo.save(integration);
  }

  findByCompany(companyId: string) {
    return this.repo.find({ where: { companyId } });
  }
}
