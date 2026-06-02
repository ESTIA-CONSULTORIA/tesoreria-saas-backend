import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class PhysicalCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fecha: Date;

  @Column()
  insumoId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  existenciaTeorica: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  existenciaFisica: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  diferencia: number;

  @Column({ nullable: true })
  motivo: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
