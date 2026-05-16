import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class ReconciliationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column()
  name: string;

  @Column()
  sourceType: string;

  @Column()
  targetType: string;

  @Column({ type: 'decimal', default: 0 })
  amountTolerance: number;

  @Column({ default: 0 })
  daysTolerance: number;

  @Column({ nullable: true })
  referencePattern: string;

  @Column({ type: 'jsonb', nullable: true })
  conditions: any;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
