import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { EstadoPrueba } from '../prueba-publica.config';

// Tabla propia (prueba-publica-pp0-migration.sql): desplegar el código no depende de correr el SQL, y no toca ninguna tabla existente.
@Entity('pruebas_publicas')
export class PruebaPublica {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  tenantId: string | null;

  // sha256(correo normalizado + sal del servidor): controla duplicados sin guardar la lista de correos en claro.
  @Column({ type: 'varchar', length: 64 })
  correoHash: string;

  @Column({ type: 'varchar', length: 120 })
  correoDominio: string;

  // El correo en claro solo se necesita hasta crear el ADMIN del tenant: va cifrado (AES-256-GCM) y se borra al activar.
  @Column({ type: 'text', nullable: true })
  correoCifrado: string | null;

  @Column({ type: 'varchar', length: 120 })
  nombreNegocio: string;

  @Column({ type: 'varchar', length: 120 })
  nombrePersona: string;

  @Column({ type: 'varchar', length: 20 })
  giro: string;

  // Consentimiento del aviso de privacidad: lo estampa el SERVIDOR (nunca el cliente) con la versión y la URL vigentes al aceptar.
  @Column({ type: 'timestamptz' })
  avisoAceptadoEn: Date;

  @Column({ type: 'varchar', length: 40 })
  avisoVersion: string;

  @Column({ type: 'varchar', length: 300 })
  avisoUrl: string;

  // Del enlace de activación; se pone en NULL al canjearlo (un solo uso). Nunca se guarda el token en claro.
  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenVenceEn: Date | null;

  @Column({ type: 'varchar', length: 16 })
  estado: EstadoPrueba;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  venceEn: Date | null;

  @Column({ type: 'boolean', default: false })
  extendida: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
