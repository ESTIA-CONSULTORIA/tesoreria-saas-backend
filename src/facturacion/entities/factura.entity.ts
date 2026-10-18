import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { CfdiEntrada } from '../pac/pac.types';

// CFDI F1 (DISENO-CFDI-40.md §3, §5). Tablas NUEVAS (facturacion-f1-migration.sql). TODO comprobante de esta fase sale con
// `sinValidezFiscal = true`: el único adaptador es el Mock, no hay timbrado real.

export type EstadoFactura =
  | 'LISTO'
  | 'PENDIENTE'
  | 'TIMBRADO'
  | 'ERROR_VALIDACION'
  | 'INCIERTO'
  | 'CANCELACION_PENDIENTE'
  | 'CANCELADO';

export type TipoFactura = 'I' | 'E';

@Entity('facturas')
@Index('UQ_facturas_clave', ['tenantId', 'claveIdempotencia'], { unique: true })
export class Factura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ type: 'varchar', length: 1 })
  tipo: TipoFactura;

  @Column({ type: 'varchar', length: 24 })
  estado: EstadoFactura;

  @Column({ type: 'varchar', length: 25, nullable: true })
  serie: string | null;

  @Column({ type: 'int', nullable: true })
  folio: number | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  uuid: string | null;

  @Column({ type: 'uuid', nullable: true })
  receptorFiscalId: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  usoCfdi: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  formaPago: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  metodoPago: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  impuestos: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  total: number;

  // Lo que se mandó al proveedor (snapshot). Sirve para la nota de crédito y para auditar; no contiene secretos.
  @Column({ type: 'jsonb' })
  entrada: CfdiEntrada;

  // Venta de origen (ingreso) o factura original (egreso).
  @Column({ type: 'uuid', nullable: true })
  ventaId: string | null;

  @Column({ type: 'uuid', nullable: true })
  relacionadaFacturaId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  relacionadoUuid: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  tipoRelacion: string | null;

  // Índices de los conceptos de la factura original que ampara esta nota de crédito.
  @Column({ type: 'jsonb', nullable: true })
  conceptosAcreditados: number[] | null;

  @Column({ type: 'varchar', length: 80 })
  claveIdempotencia: string;

  @Column({ type: 'timestamptz', nullable: true })
  fechaTimbrado: Date | null;

  // El Mock guarda aquí su XML simulado; con un PAC real el XML irá al almacenamiento y aquí solo la referencia y el hash.
  @Column({ type: 'text', nullable: true })
  xml: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  xmlHash: string | null;

  @Column({ type: 'boolean', default: true })
  sinValidezFiscal: boolean;

  @Column({ type: 'varchar', length: 60, nullable: true })
  errorCodigo: string | null;

  @Column({ type: 'text', nullable: true })
  errorMensaje: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  motivoCancelacion: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  creadoPor: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Candado anti-doble facturación: una venta solo puede tener UNA factura de ingreso activa (índice único parcial WHERE activa).
@Entity('factura_ventas')
export class FacturaVenta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'uuid' })
  facturaId: string;

  @Column({ type: 'uuid' })
  ventaId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  importe: number;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('factura_eventos')
export class FacturaEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'uuid' })
  facturaId: string;

  @Column({ type: 'varchar', length: 40 })
  evento: string;

  @Column({ type: 'jsonb', nullable: true })
  detalle: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  actor: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('fiscal_series')
@Index('UQ_fiscal_series', ['companyId', 'tipo', 'serie'], { unique: true })
export class SerieFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column({ type: 'varchar', length: 1 })
  tipo: TipoFactura;

  @Column({ type: 'varchar', length: 25 })
  serie: string;

  @Column({ type: 'int', default: 0 })
  folioActual: number;
}
