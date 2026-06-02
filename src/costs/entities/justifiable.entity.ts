import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum JustifiableCategory {
  ENERGETICOS = 'ENERGETICOS',
  INSUMOS_SERVICIO = 'INSUMOS_SERVICIO',
  CORTESIAS_DESCUENTOS = 'CORTESIAS_DESCUENTOS',
  MERMAS_FALTANTES = 'MERMAS_FALTANTES',
}

@Entity()
export class Justifiable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  periodo: string;

  @Column({
    type: 'enum',
    enum: JustifiableCategory,
  })
  categoria: JustifiableCategory;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto: number;

  @Column({ type: 'json', nullable: true })
  detalles: any;

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
