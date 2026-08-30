import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { StoredFile } from './entities/stored-file.entity';
import { Base64PostgresProvider } from './providers/base64-postgres.provider';
import { CloudinaryProvider } from './providers/cloudinary.provider';
import { StorageProvider, UploadInput } from './storage-provider.interface';

interface UploadFileInput extends UploadInput {
  tenantId: string;
  ownerType: string;
  ownerId: string;
  role: string;
}

// Auditoría de producto (GoodsHabits, Fase 3): fachada — todo caller nuevo (Contratos, y
// luego Nómina/Firma) pasa por upload()/getContent()/deleteStoredFile(), nunca por el
// proveedor concreto ni por base64/Cloudinary directo. El proveedor activo se decide una
// sola vez aquí, por STORAGE_PROVIDER — cambiarlo a S3 el día de mañana es agregar una
// clase que implemente StorageProvider y sumarla al switch de abajo, sin tocar
// Contratos/Nómina/Firma.
//
// Los métodos uploadBase64()/deleteFile()/getSignedUrl() al final del archivo son el API
// ANTERIOR a este refactor — se mantienen con el mismo nombre, firma y comportamiento
// porque hr.service.ts (expedientes de RH, todavía sin migrar a StoredFile) los sigue
// llamando. No se tocan en este frente.
@Injectable()
export class StorageService {
  private readonly provider: StorageProvider;

  constructor(
    @InjectRepository(StoredFile) private readonly fileRepo: Repository<StoredFile>,
    private readonly base64Provider: Base64PostgresProvider,
    private readonly cloudinaryProvider: CloudinaryProvider,
  ) {
    this.provider = process.env.STORAGE_PROVIDER === 'cloudinary' ? this.cloudinaryProvider : this.base64Provider;
  }

  private providerFor(name: string): StorageProvider {
    return name === 'cloudinary' ? this.cloudinaryProvider : this.base64Provider;
  }

  async upload(input: UploadFileInput): Promise<StoredFile> {
    const result = await this.provider.upload(input);
    return this.fileRepo.save(
      this.fileRepo.create({
        tenantId: input.tenantId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        role: input.role,
        provider: this.provider.name,
        providerRef: result.providerRef,
        url: result.url,
        mimeType: input.mimeType,
        sizeBytes: result.sizeBytes,
      }),
    );
  }

  async getContent(fileId: string): Promise<{ base64?: string; url?: string; mimeType?: string } | null> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) return null;
    // Si el proveedor ya guardó una URL directa (Cloudinary), no hace falta volver a
    // pedírsela — evita una llamada de red extra por cada lectura.
    if (file.url) return { url: file.url, mimeType: file.mimeType };
    const content = await this.providerFor(file.provider).get(file.providerRef);
    return { base64: content.data?.toString('base64'), url: content.url, mimeType: file.mimeType };
  }

  getByOwner(ownerType: string, ownerId: string, role?: string): Promise<StoredFile[]> {
    const where: any = { ownerType, ownerId };
    if (role) where.role = role;
    return this.fileRepo.find({ where });
  }

  getOneByOwner(ownerType: string, ownerId: string, role: string): Promise<StoredFile | null> {
    return this.fileRepo.findOne({ where: { ownerType, ownerId, role } });
  }

  async deleteStoredFile(fileId: string): Promise<void> {
    const file = await this.fileRepo.findOne({ where: { id: fileId } });
    if (!file) return;
    await this.providerFor(file.provider).delete(file.providerRef);
    await this.fileRepo.delete(fileId);
  }

  // ═══════════════════════════════════════════════════════════════
  // API legacy — sin cambios de comportamiento, ver nota arriba.
  // ═══════════════════════════════════════════════════════════════

  async uploadBase64(
    base64: string,
    folder: string,
    publicId?: string,
  ): Promise<{ url: string; publicId: string }> {
    const provider = process.env.STORAGE_PROVIDER || 'base64';

    if (provider === 'cloudinary') {
      const dataUri = base64.startsWith('data:') ? base64 : `data:application/octet-stream;base64,${base64}`;
      const result = await cloudinary.uploader.upload(dataUri, {
        folder,
        public_id: publicId,
        resource_type: 'auto',
      });
      return { url: result.secure_url, publicId: result.public_id };
    }

    return { url: '', publicId: publicId || '' };
  }

  async deleteFile(publicId: string): Promise<void> {
    const provider = process.env.STORAGE_PROVIDER || 'base64';
    if (provider === 'cloudinary') {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
    }
  }

  async getSignedUrl(publicId: string, expiresInSeconds = 3600): Promise<string> {
    const provider = process.env.STORAGE_PROVIDER || 'base64';
    if (provider === 'cloudinary') {
      return cloudinary.url(publicId, {
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
        resource_type: 'auto',
      });
    }
    return '';
  }
}
