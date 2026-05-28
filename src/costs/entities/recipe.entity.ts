import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Recipe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ default: 'PRODUCTO_VENTA' })
  tipo: string; // PRODUCTO_VENTA/INSUMO_ELABORADO

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  rendimiento: number; // cuántas unidades produce

  @Column({ default: '' })
  unidadRendimiento: string;

  @Column({ type: 'json', nullable: true })
  items: any; // [{insumoId, cantidad, unidadMedida, costoUnitario, subtotal}]

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoTotal: number; // calculado automáticamente

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precioVentaSugerido: number; // costoTotal / (1 - margenDeseado)

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0.35 })
  margenDeseado: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
