import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { CsdFiscal } from './entities/csd-fiscal.entity';
import { cifrarSecreto } from './csd-crypto';
import { inspeccionarCsd } from './csd-validador';

// Carga y estado del CSD de una empresa (DISENO-CFDI-40.md §2.3). Solo ADMIN. La llave y su contraseña se cifran con
// ENCRYPTION_KEY (AES-256-GCM, con el tenant y la empresa como datos autenticados) y NUNCA salen por ninguna respuesta.
// En esta fase el CSD se guarda y valida, pero NO firma nada: el único adaptador es el Mock.

export interface CsdEstado {
  cargado: boolean;
  numeroCertificado?: string;
  rfc?: string;
  vigenteDesde?: Date;
  vigenteHasta?: Date;
  vencido?: boolean;
  diasParaVencer?: number;
  cargadoPor?: string | null;
  advertencias?: string[];
}

@Injectable()
export class CsdService {
  constructor(
    @InjectRepository(CsdFiscal) private csds: Repository<CsdFiscal>,
    @InjectRepository(EmisorFiscal) private emisores: Repository<EmisorFiscal>,
    @InjectRepository(Company) private companies: Repository<Company>,
  ) {}

  private async empresaDelTenant(tenantId: string, companyId: string) {
    const c = await this.companies.findOne({ where: { id: companyId, tenantId } });
    if (!c) throw new NotFoundException('Empresa no encontrada');
    return c;
  }

  private estado(c: CsdFiscal | null, advertencias: string[] = []): CsdEstado {
    if (!c) return { cargado: false };
    const ms = new Date(c.vigenteHasta).getTime() - Date.now();
    return {
      cargado: true,
      numeroCertificado: c.numeroCertificado,
      rfc: c.rfc,
      vigenteDesde: c.vigenteDesde,
      vigenteHasta: c.vigenteHasta,
      vencido: ms <= 0,
      diasParaVencer: Math.floor(ms / 86_400_000),
      cargadoPor: c.cargadoPor,
      advertencias,
    };
  }

  async obtenerEstado(tenantId: string, companyId: string): Promise<CsdEstado> {
    await this.empresaDelTenant(tenantId, companyId);
    return this.estado(await this.csds.findOne({ where: { tenantId, companyId, activo: true } }));
  }

  async cargar(tenantId: string, companyId: string, body: { cerB64?: unknown; keyB64?: unknown; password?: unknown }, actor: string): Promise<CsdEstado> {
    await this.empresaDelTenant(tenantId, companyId);
    const emisor = await this.emisores.findOne({ where: { tenantId, companyId } });
    if (!emisor) throw new BadRequestException('Captura primero los datos fiscales del emisor (RFC) de esta empresa.');

    const r = inspeccionarCsd({ cerB64: body?.cerB64, keyB64: body?.keyB64, password: body?.password, rfcEmpresa: emisor.rfc });
    if (!r.ok) throw new UnprocessableEntityException({ message: 'El CSD no se pudo validar.', errores: r.errores });

    // Cifrar ANTES de tocar la BD: sin ENCRYPTION_KEY falla aquí con un error claro y no se pierde el CSD anterior.
    const keyCifrado = cifrarSecreto(Buffer.from(String(body.keyB64).replace(/^data:[^,]*,/, '').replace(/\s+/g, ''), 'base64').toString('base64'), `${tenantId}|${companyId}|key`);
    const passwordCifrado = cifrarSecreto(String(body.password), `${tenantId}|${companyId}|password`);

    const previos = await this.csds.find({ where: { tenantId, companyId, activo: true } });
    for (const p of previos) {
      p.activo = false;
      await this.csds.save(p);
    }
    const guardado = await this.csds.save(
      this.csds.create({
        tenantId,
        companyId,
        numeroCertificado: r.csd.numeroCertificado,
        rfc: r.csd.rfc,
        vigenteDesde: r.csd.vigenteDesde,
        vigenteHasta: r.csd.vigenteHasta,
        cerPem: r.csd.cerPem,
        keyCifrado,
        passwordCifrado,
        activo: true,
        cargadoPor: actor,
      }),
    );
    return this.estado(guardado, r.advertencias);
  }

  async desactivar(tenantId: string, companyId: string): Promise<CsdEstado> {
    await this.empresaDelTenant(tenantId, companyId);
    for (const p of await this.csds.find({ where: { tenantId, companyId, activo: true } })) {
      p.activo = false;
      await this.csds.save(p);
    }
    return { cargado: false };
  }
}
