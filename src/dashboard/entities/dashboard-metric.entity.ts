import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity()
export class DashboardMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  key: string;

  @Column({ type: 'decimal', default: 0 })
  value: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
