import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hr_shift')
export class HrShift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  name: string;

  @Column({ default: '09:00' })
  startTime: string;

  @Column({ default: '18:00' })
  endTime: string;

  @Column({ type: 'text', default: '["LUN","MAR","MIE","JUE","VIE"]' })
  days: string;

  @Column({ default: 15 })
  toleranceMinutes: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
