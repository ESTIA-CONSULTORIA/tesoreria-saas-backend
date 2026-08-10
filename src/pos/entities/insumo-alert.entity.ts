import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('insumo_alerts')
export class InsumoAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ nullable: true })
  insumoId: string; // vínculo real al Insumo, cuando el origen lo conoce (ej. SalesService).
                     // Nullable: alertas manuales legacy (CorteCajaLite) no lo tienen todavía.

  @Column()
  nombre: string;

  @Column({ nullable: true })
  tipo: string;

  @Column({ default: 'proximo' })
  estado: string;

  @Column({ nullable: true })
  notas: string;

  @Column({ nullable: true })
  reportadoPor: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
