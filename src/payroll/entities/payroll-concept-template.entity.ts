import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class PayrollConceptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  employeeId: string;

  @Column()
  name: string;

  @Column()
  type: string; // P | D

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  defaultAmount: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
