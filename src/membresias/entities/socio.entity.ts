import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Socio del gimnasio: la persona que paga la membresía. Entidad propia (no es Patient, que es del módulo médico).
// Tabla nueva: ver membresias-migration.sql en la raíz del backend.
@Entity('socios')
export class Socio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'varchar', nullable: true })
  branchId: string | null;

  @Column({ length: 30 })
  numeroSocio: string;

  @Column()
  nombre: string;

  @Column({ type: 'varchar', nullable: true })
  apellidos: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefono: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'date', nullable: true })
  fechaNacimiento: string | null;

  // HMAC del NIP con llave del servidor: nunca el NIP en claro. Se busca por igualdad (único por negocio).
  @Column({ type: 'varchar', length: 64, nullable: true, select: false })
  nipHash: string | null;

  @Column({ length: 10, default: 'ACTIVO' })
  estado: 'ACTIVO' | 'BAJA';

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
