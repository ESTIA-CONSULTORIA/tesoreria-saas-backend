import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { PosCategory } from './category.entity';

@Entity('product')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  categoryId: string;

  @ManyToOne(() => PosCategory, category => category.products, { nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category: PosCategory;

  @Column({ default: '' })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ default: 'SIMPLE' })
  type: string; // SIMPLE (retail) or PREPARADO (recipe)

  @Column({ nullable: true })
  recipeId: string; // For PREPARADO type

  @Column({ nullable: true })
  insumoId: string; // For SIMPLE type

  @Column({ default: true })
  isActive: boolean;

  // POS flexible, capacidad notas_cocina_barra: estación de preparación que genera nota
  // automática al vender este producto (SalesService.create()). Nullable a propósito — la
  // mayoría de productos (ej. una botella de agua embotellada) no van a ninguna estación y
  // no deben generar nada. Reemplaza el diseño inicial de un booleano requierePreparacion:
  // cocina y barra son estaciones independientes, cada una viendo solo sus propios ítems
  // (alimentos vs. bebidas), no un simple sí/no.
  //
  // Tipo TS sin `| null` a propósito (mismo criterio que companyId en Consulta/Patient/Cita):
  // unir `| null` al tipo hace que TypeScript refleje el metadato de diseño como `Object`
  // en vez de `String`, y TypeORM no soporta la columna Postgres resultante
  // (DataTypeNotSupportedError: "Object" no es un tipo válido) — la nulabilidad real la da
  // `nullable: true` en el decorator, no el tipo de TS.
  @Column({ nullable: true })
  estacionPreparacion: 'COCINA' | 'BARRA';

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
