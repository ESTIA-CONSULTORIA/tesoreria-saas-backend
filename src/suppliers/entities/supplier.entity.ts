import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ nullable: true })
  razonSocial: string;

  @Column({ nullable: true })
  rfc: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ nullable: true })
  contacto: string;

  @Column({ nullable: true })
  direccion: string;

  @Column({ nullable: true })
  ciudad: string;

  @Column({ nullable: true })
  estado: string;

  @Column({ nullable: true })
  pais: string;

  @Column({ default: 'CONTADO' })
  condicionesPago: string; // contado/7dias/15dias/30dias/45dias/60dias

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  limiteCredito: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  saldoPendiente: number;

  @Column({ default: 'MXN' })
  moneda: string; // MXN/USD

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
