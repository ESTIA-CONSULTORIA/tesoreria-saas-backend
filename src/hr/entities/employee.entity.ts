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

  @CreateDateColumn()
  createdAt: Date;
}
