import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class ContractTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column()
  name: string;

  @Column()
  fileType: string;

  @Column({ type: 'text' })
  fileBase64: string;

  @Column({ type: 'jsonb', nullable: true })
  detectedFields: string[];

  @Column({ nullable: true, default: 'INDETERMINADO' })
  contractType: string;

  @Column({ nullable: true, default: 'OPERATIVO' })
  employeeLevel: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isGlobal: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
