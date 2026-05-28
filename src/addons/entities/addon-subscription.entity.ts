import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class AddonSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ default: '' })
  moduloNombre: string;

  @Column({ type: 'date', nullable: true })
  activoDesde: string;

  @Column({ type: 'date', nullable: true })
  activoHasta: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precio: number;

  @Column({ default: 'ACTIVO' })
  status: string; // ACTIVO/VENCIDO/CANCELADO

  @CreateDateColumn()
  createdAt: Date;
}
