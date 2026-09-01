import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class HrDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @Column()
  tipo: string; // INE | CURP | NSS | CONTRATO | COMPROBANTE_DOMICILIO | ACTA_NACIMIENTO | FOTO | OTRO

  @Column({ nullable: true })
  nombre: string;

  // Auditoría de producto (GoodsHabits, Fase 3 — Storage frente 2): las columnas fileData/url
  // que vivían aquí se migraron a StoredFile — ver migración
  // MigrateHrDocumentFilesToStoredFile. Se leen/escriben vía StorageService, filtrando
  // StoredFile por ownerType: 'hr_document', ownerId: this.id, role: 'file' (siempre
  // 'file' — a diferencia de Contract, HrDocument es 1:1 con su archivo, así que no hace
  // falta distinguir roles; "tipo" ya dice QUÉ es el documento).

  @Column({ nullable: true })
  notas: string;

  @Column({ type: 'jsonb', nullable: true })
  ocrExtracted: Record<string, any>;

  @Column({ default: false })
  ocrConfirmed: boolean;

  @CreateDateColumn()
  uploadedAt: Date;
}
