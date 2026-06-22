import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('attendance')
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column()
  employeeId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'timestamp', nullable: true })
  checkIn: Date;

  @Column({ type: 'timestamp', nullable: true })
  checkOut: Date;

  @Column({ default: 'WEB' })
  method: string; // WEB | KIOSK_FACE | KIOSK_FINGER | WHATSAPP

  @Column({ default: 'PRESENTE' })
  status: string; // PRESENTE | TARDANZA | FALTA | JUSTIFICADO | SIN_SALIDA

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  lng: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ nullable: true })
  incidenceType: string; // TIEMPO_EXTRA | DIA_FESTIVO | SUSPENSION | INCAPACIDAD_CON_RIESGO | INCAPACIDAD_SIN_RIESGO

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  overtimeHours: number;

  @Column({ nullable: true })
  incidenceNote: string;

  @CreateDateColumn()
  createdAt: Date;
}
