import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Autorización de un solo uso (pos-autorizaciones-migration.sql): un gerente/admin autoriza una cortesía o un descuento sobre el tope.
// Nunca guarda el token (solo su hash) ni la contraseña de nadie.
@Entity('pos_autorizaciones')
@Index('UQ_pos_autorizaciones_token', ['tokenHash'], { unique: true })
export class PosAutorizacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  tenantId: string;

  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  // CORTESIA | DESCUENTO
  @Column({ type: 'varchar', length: 10 })
  tipo: string;

  @Column({ type: 'varchar', length: 40 })
  motivo: string;

  // Hash de las líneas del ticket (o de la cuenta y su descuento) a las que aplica.
  @Column({ type: 'varchar', length: 64 })
  hashLineas: string;

  @Column({ type: 'varchar', length: 64 })
  autorizadoPorId: string;

  @Column({ type: 'varchar', length: 255 })
  autorizadoPorEmail: string;

  @Column({ type: 'varchar', length: 20 })
  autorizadoPorRol: string;

  // Quien pidió la autorización (el cajero): solo él puede usar el token.
  @Column({ type: 'varchar', length: 64 })
  solicitadoPorId: string;

  @Column({ type: 'varchar', length: 255 })
  solicitadoPorEmail: string;

  @Column({ type: 'timestamp' })
  expiraEn: Date;

  @Column({ type: 'timestamp', nullable: true })
  usadoEn: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
