import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Datos fiscales del EMISOR (una fila por empresa). Tabla propia —no columnas en `company`— para que desplegar el código no
// dependa de haber corrido antes el SQL sobre una tabla que lee todo el sistema. Ver facturacion-f0-migration.sql.
@Entity('fiscal_emisores')
export class EmisorFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ type: 'varchar', length: 13 })
  rfc: string;

  // Nombre exacto de la constancia de situación fiscal, sin régimen societario. [VALIDAR con el contador]
  @Column({ type: 'varchar', length: 254 })
  nombreFiscal: string;

  @Column({ type: 'varchar', length: 3 })
  regimenFiscal: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  serie: string | null;

  @Column({ type: 'int', default: 1 })
  folioActual: number;

  @Column({ default: false })
  facturacionActiva: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
