import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class StorageService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

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
