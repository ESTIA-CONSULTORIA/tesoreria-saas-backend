import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Lugar de expedición (código postal) de cada sucursal. Tabla propia, ver emisor-fiscal.entity.ts.
@Entity('fiscal_sucursales')
export class SucursalFiscal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  branchId: string;

  @Column({ type: 'varchar', length: 5 })
  codigoPostalExpedicion: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
