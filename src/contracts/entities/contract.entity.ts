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

  @Column()
  status: string;

  @Column()
  signatureLevel: string;

  @Column({ type: 'text', nullable: true })
  contractPdfBase64: string;

  @Column({ type: 'text', nullable: true })
  signedPdfBase64: string;

  @Column({ type: 'text', nullable: true })
  signatureBase64: string;

  @Column({ type: 'text', nullable: true })
  selfieBase64: string;

  @Column({ type: 'text', nullable: true })
  ineFrontBase64: string;

  @Column({ type: 'text', nullable: true })
  ineBackBase64: string;

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
