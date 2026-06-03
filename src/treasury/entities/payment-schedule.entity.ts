import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class PaymentSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  concepto: string;

  @Column('decimal')
  monto: number;

  @Column()
  cuentaOrigenId: string;

  @Column({ type: 'date' })
  fechaProgramada: Date;

  @Column({ default: 'PENDIENTE' })
  status: 'PENDIENTE' | 'PAGADO' | 'CANCELADO';

  @Column({ default: 'EGRESO' })
  tipo: 'INGRESO' | 'EGRESO';

  @Column({ nullable: true })
  referencia: string;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;
}
