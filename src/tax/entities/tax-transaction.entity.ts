import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class TaxTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  taxRateId: string;

  @Column()
  referenceType: string;

  @Column({ nullable: true })
  referenceId: string;

  @Column({ type: 'decimal', default: 0 })
  taxableAmount: number;

  @Column({ type: 'decimal', default: 0 })
  taxAmount: number;

  @Column()
  direction: string;

  @CreateDateColumn()
  createdAt: Date;
}
