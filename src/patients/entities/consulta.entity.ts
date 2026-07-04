import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('consultas')
export class Consulta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  patientId: string;

  @Column()
  doctor: string;

  @Column()
  tratamiento: string;

  @Column({ type: 'decimal', default: 0 })
  importe: number;

  @Column({ type: 'decimal', default: 0 })
  pagado: number;

  @Column({ default: 'efectivo' })
  metodoPago: string;

  @Column({ default: 'pagado' })
  status: string;

  @Column({ nullable: true })
  proximaCita: Date;

  @Column({ nullable: true })
  notas: string;

  @CreateDateColumn()
  fecha: Date;
}
