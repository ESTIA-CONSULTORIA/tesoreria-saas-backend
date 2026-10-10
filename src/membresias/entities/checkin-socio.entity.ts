import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Cada entrada al gimnasio, permitida o denegada, con el motivo. Tabla nueva: membresias-migration.sql.
@Entity('checkins_socios')
export class CheckinSocio {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ type: 'uuid' })
  socioId: string;

  @Column({ type: 'varchar', nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', nullable: true })
  membresiaId: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  fechaHora: Date;

  @Column({ length: 10 })
  metodo: 'NUMERO' | 'NIP' | 'MANUAL';

  @Column({ length: 10 })
  resultado: 'PERMITIDO' | 'DENEGADO';

  @Column({ type: 'varchar', nullable: true })
  motivo: string | null;

  @Column({ type: 'varchar', nullable: true })
  registradoPor: string | null;
}
