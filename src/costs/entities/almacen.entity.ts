import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum AlmacenTipo {
  GENERAL = 'GENERAL',
  REFRIGERADO = 'REFRIGERADO',
  SECO = 'SECO',
  CONGELADO = 'CONGELADO',
}

@Entity()
export class Almacen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ default: '' })
  codigo: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ nullable: true })
  sucursalId: string;

  @Column({
    type: 'enum',
    enum: AlmacenTipo,
    default: AlmacenTipo.GENERAL,
  })
  tipo: AlmacenTipo;

  @Column({ nullable: true })
  responsable: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
