// Auditoría de producto (GoodsHabits, Fase 3): interfaz que StorageService usa para no
// conocer el proveedor concreto. Cambiar de base64-en-Postgres a S3 en el futuro es escribir
// una clase nueva que implemente esto — ningún caller de StorageService (Nómina, Contratos,
// Firma) cambia una línea.
export interface UploadInput {
  data: Buffer | string; // Buffer o string base64 (con o sin el prefijo data:...;base64,)
  mimeType?: string;
  fileName?: string;
  folder: string;
}

export interface UploadResult {
  providerRef: string; // lo que el proveedor necesita para volver a encontrar el archivo
  url?: string;
  sizeBytes?: number;
}

export interface RetrievedFile {
  data?: Buffer;
  url?: string;
}

export interface StorageProvider {
  readonly name: string;
  upload(input: UploadInput): Promise<UploadResult>;
  get(providerRef: string): Promise<RetrievedFile>;
  delete(providerRef: string): Promise<void>;
}
