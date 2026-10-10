import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Un periodo pagado de un socio: cada cobro o renovación crea una fila (el historial se conserva). Tabla nueva.
// "Vencida" no se guarda: es ACTIVA con fechaFin anterior a hoy (se calcula, sin tareas programadas).
@Entity('membresias')
export class Membresia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'uuid' })
  socioId: string;

  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  // Copia del nombre y del precio al momento del cobro: editar o borrar el plan no reescribe lo ya vendido.
  @Column()
  planNombre: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precioPagado: number;

  @Column({ type: 'date' })
  fechaInicio: string;

  @Column({ type: 'date' })
  fechaFin: string;

  @Column({ length: 10, default: 'ACTIVA' })
  estado: 'ACTIVA' | 'CONGELADA' | 'CANCELADA';

  @Column({ type: 'date', nullable: true })
  congeladaDesde: string | null;

  @Column({ type: 'int', default: 0 })
  diasCongelados: number;

  @Column({ type: 'varchar', nullable: true })
  ventaId: string | null;

  @Column({ type: 'varchar', nullable: true })
  folioVenta: string | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
