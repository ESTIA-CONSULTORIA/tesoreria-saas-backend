import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  apellidos: string;

  @Column({ nullable: true })
  puesto: string;

  @Column({ nullable: true })
  departamento: string;

  @Column({ type: 'date', nullable: true })
  fechaIngreso: Date;

  @Column({ nullable: true })
  curp: string;

  @Column({ nullable: true })
  rfc: string;

  @Column({ nullable: true })
  nss: string;

  @Column({ type: 'decimal', default: 0 })
  salarioQuincenal: number;

  @Column({ type: 'decimal', default: 0 })
  deducciones: number;

  @Column({ default: 'ACTIVO' })
  status: string; // ACTIVO | BAJA | VACACIONES

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  whatsapp: string;

  @Column({ nullable: true })
  shiftId: string;

  // Datos personales adicionales
  @Column({ nullable: true })
  domicilio: string;

  @Column({ nullable: true })
  colonia: string;

  @Column({ nullable: true })
  ciudad: string;

  @Column({ nullable: true })
  estado: string;

  @Column({ nullable: true })
  codigoPostal: string;

  @Column({ nullable: true })
  numeroIne: string;

  // Relación laboral
  @Column({ nullable: true })
  tipoJornada: string;

  @Column({ nullable: true })
  tipoContrato: string;

  @Column({ nullable: true })
  tipoSalario: string;

  @Column({ type: 'decimal', nullable: true, default: 0 })
  salarioDiarioIntegrado: number;

  @Column({ nullable: true })
  claveRiesgoTrabajo: string;

  // Nómina
  @Column({ nullable: true })
  banco: string;

  @Column({ nullable: true })
  clabe: string;

  @Column({ nullable: true })
  periodoPago: string; // QUINCENAL | SEMANAL | CATORCENAL

  @CreateDateColumn()
  createdAt: Date;
}
