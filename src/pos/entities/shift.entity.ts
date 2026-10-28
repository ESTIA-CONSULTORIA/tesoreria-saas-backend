import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  cajero: string; // userId

  @Column({ nullable: true })
  sucursalId: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ type: 'date' })
  fecha: Date;

  @Column({ type: 'time' })
  horaApertura: string;

  @Column({ type: 'time', nullable: true })
  horaCierre: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fondoInicial: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalVentas: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalEfectivo: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalTarjeta: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalTransferencia: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalCortesia: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDevoluciones: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalRetiros: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalDepositos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  efectivoContado: number;

  @Column({ type: 'boolean', default: false })
  precorteGuardado: boolean;

  @Column({ type: 'json', nullable: true })
  precorteDeclaracion: any; // Store cashier's declaration from precorte

  @Column({ default: 'ABIERTO' })
  status: 'ABIERTO' | 'CERRADO';

  @Column({ type: 'text', nullable: true })
  notas: string;

  @Column({ type: 'boolean', default: false })
  esRetroactivo: boolean;

  // Instantes reales (timestamptz). horaApertura/horaCierre son `time` sin fecha y en UTC: un turno que cruza la medianoche UTC queda con
  // cierre < apertura. Para mostrar y calcular duraciones usa estos dos.
  @Column({ type: 'timestamptz', nullable: true })
  abiertoEn: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cerradoEn: Date | null;

  // Folio corto por negocio (T-0001), consecutivo y único por tenant.
  @Column({ type: 'varchar', length: 16, nullable: true })
  folio: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
