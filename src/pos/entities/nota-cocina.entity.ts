import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// POS flexible, capacidad notas_cocina_barra. Una fila por ÍTEM de la venta que requiere
// preparación (no una fila por venta) — cocina y barra son estaciones independientes que
// marcan cada ítem como preparado por separado, no el ticket completo de un jalón. Sin FK
// real a nivel de BD (mismo patrón que el resto del ERP — ver Consulta.patientId,
// Transfer.fromAccountId): saleId/productoId son varchar simples.
@Entity('notas_cocina')
export class NotaCocina {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column()
  sucursalId: string;

  @Column()
  saleId: string;

  @Column()
  productoId: string;

  @Column()
  nombre: string;

  @Column({ type: 'int' })
  cantidad: number;

  // Copiado de Product.estacionPreparacion al momento de crear la nota — NO una referencia
  // viva. Si el producto cambia de estación después, las notas ya generadas conservan la
  // estación con la que se crearon (ver SalesService.generateNotasCocina()).
  @Column()
  estacion: 'COCINA' | 'BARRA';

  @Column({ default: 'PENDIENTE' })
  // 'CANCELADA': la cuenta se canceló o el ítem se quitó antes de prepararse (sale de la pantalla
  // de pendientes de cocina/barra). Columna varchar: no requiere migración.
  estado: 'PENDIENTE' | 'PREPARADO' | 'CANCELADA';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
