import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Fase 1 de la agenda de citas médicas (panel interno, sin portal de paciente todavía — ver
// auditoria-erp-business.md). Nombre y campos en español, mismo criterio que Consulta
// (src/patients/entities/consulta.entity.ts) — la entidad hermana más cercana en este mismo
// dominio — en vez de Patient (que es inglés por fuera, español por dentro). patientId es un
// varchar simple sin @ManyToOne/@JoinColumn, mismo patrón que Consulta.patientId: ninguna
// entidad de este módulo usa una FK real a nivel de base de datos, la referencia se valida a
// nivel de servicio (ver AppointmentsService.create()).
@Entity('citas')
export class Cita {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column()
  patientId: string;

  // Mismo campo/tipo que Consulta.doctor (string libre, sin catálogo de doctores todavía).
  @Column()
  doctor: string;

  // Texto libre, igual que Consulta.tratamiento — no existe ningún catálogo de
  // servicios/tratamientos en el módulo hoy, inventar uno sería alcance fuera de esta fase.
  @Column()
  servicio: string;

  // Un solo datetime en vez de fecha+hora separados: simplifica la validación de traslape
  // (un solo campo que comparar, sin combinar dos columnas ni lidiar con dos formatos).
  @Column({ type: 'timestamp' })
  fechaHora: Date;

  @Column({ type: 'int', default: 30 })
  duracionMinutos: number;

  // Mismo estilo que Transfer.status (src/transfers/entities/transfer.entity.ts): varchar +
  // unión de TypeScript, sin tipo ENUM de Postgres — no hace falta la rigidez de un enum de
  // base de datos para 4 valores que solo se escriben desde este mismo servicio.
  @Column({ default: 'PENDIENTE' })
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA';

  @Column({ nullable: true })
  notas: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
