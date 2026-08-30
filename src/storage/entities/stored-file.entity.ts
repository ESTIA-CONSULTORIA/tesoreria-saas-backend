import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// Auditoría de producto (GoodsHabits, Fase 3): registro de archivo detrás de
// StorageService — reemplaza las columnas base64 ad-hoc que cada entidad de negocio
// (Contract, HrDocument, ContractTemplate...) mantenía por su cuenta. ownerType/ownerId/role
// identifican a qué pertenece el archivo y para qué (ej. ownerType: 'contract',
// role: 'signature') sin que Contract necesite una columna dedicada por cada archivo que
// pueda tener.
@Entity('stored_file')
export class StoredFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  ownerType: string; // 'contract' — más valores cuando otros subsistemas migren a esta tabla

  @Column()
  ownerId: string;

  // 'signed_pdf': legacy — signContract() ya no la genera (ver Falta 5, Fase 3), solo
  // queda para contratos firmados antes del cambio. 'evidence_pdf': la reemplaza — PDF de
  // constancia separado del documento del contrato.
  @Column()
  role: string; // 'contract_pdf' | 'signed_pdf' | 'evidence_pdf' | 'signature' | 'selfie' | 'ine_front' | 'ine_back'

  @Column()
  provider: string; // 'base64_postgres' | 'cloudinary' — nombre del StorageProvider que lo guardó

  // Base64PostgresProvider: el archivo mismo, en base64. CloudinaryProvider: el public_id.
  // Nunca se lee/escribe directo — siempre a través de StorageService.
  @Column({ type: 'text' })
  providerRef: string;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes: number;

  @CreateDateColumn()
  createdAt: Date;
}
