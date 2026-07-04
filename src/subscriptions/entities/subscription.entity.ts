import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ default: 'BASIC' })
  planCode: string;

  @Column({ nullable: true })
  billingCycle: string;

  @Column({ nullable: true, type: 'decimal' })
  price: number;

  @Column({ type: 'date', nullable: true })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ default: 'ACTIVE' })
  status: string;

  @Column({ nullable: true, type: 'timestamp' })
  alertSentAt: Date;

  @Column({ default: false })
  alertSent7: boolean;

  @Column({ default: false })
  alertSent5: boolean;

  @Column({ default: false })
  alertSent1: boolean;
}