import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('permission_request')
export class PermissionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column()
  employeeId: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  hours: number;

  @Column({ default: 'PERSONAL' })
  type: string; // PERSONAL | MEDICO | FAMILIAR | OTRO

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ default: 'PENDIENTE' })
  status: string; // PENDIENTE | APROBADA | RECHAZADA

  @Column({ nullable: true })
  approvedBy: string;

  @Column({ type: 'text', nullable: true })
  responseNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
