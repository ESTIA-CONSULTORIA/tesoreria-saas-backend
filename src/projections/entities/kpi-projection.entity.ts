import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class KpiProjection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  metric: string;

  @Column({ type: 'decimal', default: 0 })
  value: number;

  @Column({ nullable: true })
  period: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @UpdateDateColumn()
  updatedAt: Date;
}
