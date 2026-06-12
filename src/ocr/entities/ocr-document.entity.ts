import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class OcrDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ default: 'PENDING' })
  status: string; // PENDING | VALIDATED | REJECTED

  @Column({ type: 'text', nullable: true })
  rawText: string;

  @Column({ type: 'jsonb', nullable: true })
  extractedData: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  validatedData: Record<string, any>;

  @Column({ default: 'FACTURA' })
  documentType: string; // FACTURA | RECIBO | CONTRATO | OTRO

  @Column({ nullable: true })
  fileName: string;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  validatedAt: Date;

  @Column({ nullable: true })
  validatedBy: string;
}
