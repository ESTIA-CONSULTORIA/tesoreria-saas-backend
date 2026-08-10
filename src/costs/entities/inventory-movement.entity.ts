import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// Ledger auditable de movimientos individuales de inventario — a diferencia de Inventory
// (agregado por período, sin detalle de eventos), aquí cada fila es un evento puntual:
// una venta, una compra, un ajuste de conteo, etc. Primer consumidor: SalesService,
// tipo='SALIDA_VENTA' desde deductInsumo(), dentro de la misma transacción de la venta.
@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  insumoId: string;

  @Column()
  tenantId: string;

  @Column()
  tipo: string; // 'SALIDA_VENTA' hoy; extensible a 'ENTRADA_COMPRA', 'AJUSTE_CONTEO', etc.

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  cantidad: number; // siempre positiva; la dirección la da 'tipo'

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  stockResultante: number; // snapshot de Insumo.stockActual justo después de este movimiento

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costoUnitario: number; // snapshot de Insumo.costoUnitario al momento del movimiento

  @Column({ nullable: true })
  referencia: string; // folio de la venta (o de la compra, a futuro)

  @Column({ nullable: true })
  sucursalId: string;

  @Column({ nullable: true })
  notas: string;

  @CreateDateColumn()
  fecha: Date;
}
