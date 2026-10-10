import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Lo que el cliente configura desde pantalla: nombre, precio, periodo y beneficios. Tabla nueva: membresias-migration.sql.
export interface BeneficiosPlan {
  // % de descuento en las compras del POS del socio con membresía vigente. Se aplica en el servidor y respeta los topes por
  // rol de los descuentos del POS (CAJERO y RECEPCION 10 %, CAPITAN 20 %, GERENTE y ADMIN sin tope).
  descuentoPct?: number;
  // Texto libre que el cliente quiere mostrar (accesos, clases incluidas, invitados...). No afecta ningún cálculo.
  notas?: string[];
}

@Entity('planes_membresia')
export class PlanMembresia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  // Como el negocio captura sus precios: sin IVA o con IVA incluido (preciosIncluyenIva). El IVA y el total los calcula el
  // servidor al cobrar, con la misma regla de cualquier producto del POS.
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio: number;

  @Column({ type: 'varchar', length: 6 })
  periodoTipo: 'DIAS' | 'MESES' | 'ANOS';

  @Column({ type: 'int' })
  periodoCantidad: number;

  // null = usa el IVA por defecto del negocio.
  @Column({ type: 'varchar', length: 10, nullable: true })
  tasaIva: string | null;

  @Column({ type: 'int', default: 0 })
  diasCongelacionMax: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  beneficios: BeneficiosPlan;

  // Producto del POS (servicio, sin inventario) que representa este plan: el cobro, el IVA y el corte son los del POS.
  @Column({ type: 'varchar', nullable: true })
  productId: string | null;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
