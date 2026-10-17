import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Claves SAT de un producto (una fila por producto). La tasa de IVA sigue en product.tasaIva; aquí NO se duplica.
// Tabla propia, ver emisor-fiscal.entity.ts.
@Entity('fiscal_productos')
export class ProductoFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  productId: string;

  @Column({ type: 'varchar', length: 8 })
  claveProdServ: string;

  @Column({ type: 'varchar', length: 3 })
  claveUnidad: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  unidadNombre: string | null;

  @Column({ type: 'varchar', length: 2 })
  objetoImp: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
