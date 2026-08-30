import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { StorageProvider, UploadInput, UploadResult, RetrievedFile } from '../storage-provider.interface';

// Auditoría de producto (GoodsHabits, Fase 3): mismo comportamiento que ya tenía el
// StorageService original (uploadBase64 con STORAGE_PROVIDER=cloudinary), ahora detrás de
// la interfaz StorageProvider en vez de una rama if/else dentro de cada método del service.
@Injectable()
export class CloudinaryProvider implements StorageProvider {
  readonly name = 'cloudinary';

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const base64 = Buffer.isBuffer(input.data) ? input.data.toString('base64') : input.data;
    const dataUri = base64.startsWith('data:')
      ? base64
      : `data:${input.mimeType || 'application/octet-stream'};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: input.folder,
      public_id: input.fileName,
      resource_type: 'auto',
    });

    return {
      providerRef: result.public_id,
      url: result.secure_url,
      sizeBytes: result.bytes,
    };
  }

  async get(providerRef: string): Promise<RetrievedFile> {
    return {
      url: cloudinary.url(providerRef, {
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        resource_type: 'auto',
      }),
    };
  }

  async delete(providerRef: string): Promise<void> {
    await cloudinary.uploader.destroy(providerRef, { resource_type: 'auto' });
  }
}
