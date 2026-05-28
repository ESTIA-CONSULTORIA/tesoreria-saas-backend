import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ default: 'BASIC' })
  planCode: string; // BASIC, PRO, ENTERPRISE

  @Column({ type: 'date', nullable: true })
  startDate: string;

  @Column({
  type: 'date',
  nullable: true,
})
endDate: string | null;

  @Column({ default: 'ACTIVE' })
  status: string; // ACTIVE, EXPIRED, SUSPENDED
}