import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

// Auditoría de producto (GoodsHabits, Fase 3): fachada — todo caller (Contratos, Nómina,
// Firma, RH) pasa por upload()/getContent()/deleteStoredFile(), nunca por el proveedor
// concreto ni por base64/Cloudinary directo. El proveedor activo se decide una sola vez
// aquí, por STORAGE_PROVIDER — cambiarlo a S3 el día de mañana es agregar una clase que
// implemente StorageProvider y sumarla al switch de abajo, sin tocar ningún caller.
//
// El API legacy (uploadBase64()/deleteFile()/getSignedUrl()) que vivía al final de este
// archivo se retiró junto con la migración de HrDocument (Frente 2, ver
// MigrateHrDocumentFilesToStoredFile) — era el último caller que quedaba sin pasar por
// upload()/getContent().
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

  // Auditoría de producto (GoodsHabits, Fase 3 — Storage, Frente 2 / HrDocument): versión en
  // lote de getContent() — para listados (findDocsByEmployee, getEmployeePhotos) que antes
  // leían fileData/url directo de la fila y ahora necesitan resolverlos vía StoredFile sin
  // caer en un round-trip a BD por documento. Una sola query con IN(...); asume relación 1:1
  // ownerId↔role igual que el resto de este frente (role='file' constante para HrDocument),
  // así que devuelve como mucho un resultado por ownerId — si algún ownerId tuviera más de
  // una fila para ese role, se queda con la última que procese el Map.
  async getContentByOwners(
    ownerType: string,
    ownerIds: string[],
    role: string,
  ): Promise<Map<string, { base64?: string; url?: string; mimeType?: string }>> {
    const result = new Map<string, { base64?: string; url?: string; mimeType?: string }>();
    if (!ownerIds.length) return result;

    const files = await this.fileRepo.find({ where: { ownerType, ownerId: In(ownerIds), role } });
    for (const file of files) {
      if (file.url) {
        result.set(file.ownerId, { url: file.url, mimeType: file.mimeType });
        continue;
      }
      const content = await this.providerFor(file.provider).get(file.providerRef);
      result.set(file.ownerId, { base64: content.data?.toString('base64'), url: content.url, mimeType: file.mimeType });
    }
    return result;
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
}
