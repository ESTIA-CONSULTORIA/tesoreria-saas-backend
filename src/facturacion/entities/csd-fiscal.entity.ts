import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// CSD (certificado de sello digital) de una empresa. Tabla nueva (facturacion-f1-migration.sql). La llave privada y su
// contraseña van CIFRADAS con ENCRYPTION_KEY (AES-256-GCM, ver csd-crypto.ts) y NUNCA salen por la API; el .cer es público.
@Entity('fiscal_csd')
export class CsdFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ type: 'varchar', length: 20 })
  numeroCertificado: string;

  @Column({ type: 'varchar', length: 13 })
  rfc: string;

  @Column({ type: 'timestamptz' })
  vigenteDesde: Date;

  @Column({ type: 'timestamptz' })
  vigenteHasta: Date;

  @Column({ type: 'text' })
  cerPem: string;

  @Column({ type: 'text', select: false })
  keyCifrado: string;

  @Column({ type: 'text', select: false })
  passwordCifrado: string;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cargadoPor: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
