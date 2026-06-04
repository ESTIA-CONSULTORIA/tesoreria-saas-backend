import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  fromAccountId: string;

  @Column({ nullable: true })
  toAccountId: string;

  @Column('decimal', { default: 0 })
  amount: number;

  @Column({ nullable: true })
  concept: string;

  @Column({ default: 'INTERNA' })
  tipo: 'INTERNA' | 'INTERCOMPAÑIA';

  @Column({ default: 'PENDIENTE' })
  status: 'PENDIENTE' | 'AUTORIZADA' | 'RECHAZADA';

  @Column({ nullable: true })
  empresaOrigenId: string;

  @Column({ nullable: true })
  empresaDestinoId: string;

  @Column({ nullable: true })
  referencia: string;

  @Column({ nullable: true })
  motivo: string;

  @CreateDateColumn()
  createdAt: Date;
}