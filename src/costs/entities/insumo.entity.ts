import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { FamiliaInsumo } from './familia-insumo.entity';

@Entity()
export class Insumo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  codigo: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ nullable: true })
  familiaId: string;

  @ManyToOne(() => FamiliaInsumo, { nullable: true })
  @JoinColumn({ name: 'familiaId' })
  familia: FamiliaInsumo;

  // unidadMedida: unidad de CONSUMO (la que usan las recetas y las ventas — "pieza", "kg"...).
  // presentacionCompra: etiqueta libre de la unidad de COMPRA, ej. "Caja de 24" (solo
  // descriptivo, no participa en ningún cálculo — el multiplicador real es factorConversion).
  @Column({ default: '' })
  presentacion: string;

  @Column({ default: '' })
  unidadMedida: string;

  @Column({ nullable: true })
  presentacionCompra: string;

  // Auditoría de seguridad (GoodsHabits, portabilidad Costos standalone): cuántas unidades de
  // CONSUMO (unidadMedida) rinde una unidad de COMPRA (presentacionCompra) — ej. 24 si
  // presentacionCompra="Caja de 24". Es el multiplicador real que usan tanto
  // CostsService.createInsumo()/updateInsumo() (costoUnitario) como
  // PurchasesService.createPurchase() (incremento de stockActual) — antes ninguno de los
  // dos lo leía y quedaba decorativo.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  factorConversion: number;

  // Se recalcula server-side en cada create()/update() de CostsService cuando llega
  // precioCompra — nunca se confía en un valor que mande el cliente para ese caso (mismo
  // patrón que estia-costos-api/InsumosService.calcularCostoUnitario()). Si NO llega
  // precioCompra (insumos capturados a mano, sin flujo de compra con presentación — el caso
  // de los insumos ya existentes en producción hoy) se respeta el valor manual tal cual, por
  // compatibilidad hacia atrás.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoUnitario: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  precioCompra: number;

  // @deprecated — nunca estuvo conectado a ningún cálculo (ni aquí ni en el import CSV) y
  // se solapaba en concepto con factorConversion, que es el campo que de verdad se usa como
  // multiplicador de presentación. Se deja en el esquema sin tocar (sin migración, columna
  // ya no expuesta en el formulario de alta/edición) en vez de retirarla — ningún insumo real
  // en producción usa un valor distinto al default, así que no hay dato que preservar, pero
  // tampoco vale la pena el trabajo de una migración de DROP COLUMN contra la fecha de venta.
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  cantidadPresentacion: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  merma: number;

  @Column({ default: 'MXN' })
  moneda: string;

  @Column({ nullable: true })
  proveedorId: string;

  @Column({ nullable: true })
  categoriaId: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  stockActual: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  stockMinimo: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  reemplazadoPorId: string;

  @ManyToOne(() => Insumo, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reemplazadoPorId' })
  reemplazadoPor: Insumo;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
