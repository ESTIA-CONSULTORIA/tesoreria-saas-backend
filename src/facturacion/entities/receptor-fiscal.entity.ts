import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Perfil fiscal del receptor (cliente/socio): reutilizable por caja, mesas y autofactura.
@Entity('receptores_fiscales')
export class ReceptorFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'varchar', length: 13 })
  rfc: string;

  @Column({ type: 'varchar', length: 254 })
  nombreFiscal: string;

  @Column({ type: 'varchar', length: 5 })
  codigoPostal: string;

  @Column({ type: 'varchar', length: 3 })
  regimenFiscal: string;

  @Column({ type: 'varchar', length: 4, nullable: true })
  usoCfdiDefault: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email: string | null;

  @Column({ default: false })
  esExtranjero: boolean;

  // Se llena cuando el PAC confirma el receptor contra el SAT (no en F0).
  @Column({ type: 'timestamptz', nullable: true })
  validadoEn: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
