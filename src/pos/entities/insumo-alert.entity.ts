import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('insumo_alerts')
export class InsumoAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  tipo: string;

  @Column({ default: 'proximo' })
  estado: string;

  @Column({ nullable: true })
  notas: string;

  @Column()
  reportadoPor: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
