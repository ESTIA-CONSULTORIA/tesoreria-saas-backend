import { Injectable } from '@nestjs/common';
import { StorageProvider, UploadInput, UploadResult, RetrievedFile } from '../storage-provider.interface';

// Auditoría de producto (GoodsHabits, Fase 3): implementación default de StorageProvider —
// el archivo vive como texto base64 en la fila de StoredFile misma (columna providerRef).
// "Subir" no habla con nada externo; "bajar" es un decode directo.
@Injectable()
export class Base64PostgresProvider implements StorageProvider {
  readonly name = 'base64_postgres';

  async upload(input: UploadInput): Promise<UploadResult> {
    const base64 = this.toBase64(input.data);
    return {
      providerRef: base64,
      sizeBytes: Buffer.byteLength(base64, 'base64'),
    };
  }

  async get(providerRef: string): Promise<RetrievedFile> {
    return { data: Buffer.from(providerRef, 'base64') };
  }

  async delete(_providerRef: string): Promise<void> {
    // No-op a propósito — no hay nada externo que limpiar. Borrar la fila de StoredFile
    // (responsabilidad de StorageService) es lo que efectivamente elimina el archivo.
  }

  private toBase64(data: Buffer | string): string {
    if (Buffer.isBuffer(data)) return data.toString('base64');
    // Acepta tanto un data URI (data:image/png;base64,....) como base64 puro.
    const match = data.match(/^data:([^;]+);base64,(.+)$/s);
    return match ? match[2] : data;
  }
}
