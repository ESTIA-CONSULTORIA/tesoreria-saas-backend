import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Contract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  employeeId: string;

  @Column()
  templateId: string;

  @Column({ nullable: true })
  fileType: string;

  @Column()
  status: string;

  @Column()
  signatureLevel: string;

  // Auditoría de producto (GoodsHabits, Fase 3): las 6 columnas base64 que vivían aquí
  // (contractPdfBase64, signedPdfBase64, signedPdfUrl, signatureBase64, selfieBase64,
  // ineFrontBase64, ineBackBase64) se migraron a StoredFile — ver migración
  // MigrateContractFilesToStoredFile. Se leen/escriben vía StorageService, filtrando
  // StoredFile por ownerType: 'contract', ownerId: this.id, role: 'contract_pdf' |
  // 'signed_pdf' | 'signature' | 'selfie' | 'ine_front' | 'ine_back'.

  @Column({ nullable: true })
  signedAt: Date;

  @Column({ nullable: true })
  signedIp: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  signedLat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  signedLng: number;

  @Column({ nullable: true })
  faceMatchScore: number;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
