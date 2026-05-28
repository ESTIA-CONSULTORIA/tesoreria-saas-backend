import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Insumo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ default: '' })
  unidadMedida: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoUnitario: number;

  @Column({ default: 'MXN' })
  moneda: string;

  @Column({ nullable: true })
  proveedorId: string;

  @Column({ nullable: true })
  categoriaId: string;

  @Column({ default: 0 })
  stockActual: number;

  @Column({ default: 0 })
  stockMinimo: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
