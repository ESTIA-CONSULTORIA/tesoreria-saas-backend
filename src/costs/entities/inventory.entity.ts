import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  insumoId: string;

  @Column({ type: 'varchar', nullable: true })
  periodo: string; // formato YYYY-MM

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  inventarioInicial: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  entradas: number; // compras del período

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  salidas: number; // consumo

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  inventarioFinal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoPromedio: number;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
