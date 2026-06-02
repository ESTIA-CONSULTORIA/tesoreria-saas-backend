import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { FamiliaInsumo } from './familia-insumo.entity';

@Entity()
export class Insumo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  codigo: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ nullable: true })
  familiaId: string;

  @ManyToOne(() => FamiliaInsumo, { nullable: true })
  @JoinColumn({ name: 'familiaId' })
  familia: FamiliaInsumo;

  @Column({ default: '' })
  presentacion: string;

  @Column({ default: '' })
  unidadMedida: string;

  @Column({ nullable: true })
  presentacionCompra: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  factorConversion: number;

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
