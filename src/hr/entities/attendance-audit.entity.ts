import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class AttendanceAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  attendanceId: string;

  @Column()
  employeeId: string;

  @Column()
  tenantId: string;

  @Column()
  date: string;

  @Column({ nullable: true })
  previousStatus: string;

  @Column({ nullable: true })
  previousIncidenceType: string;

  @Column({ nullable: true })
  newStatus: string;

  @Column({ nullable: true })
  newIncidenceType: string;

  @Column({ nullable: true })
  changeReason: string;

  @Column({ nullable: true })
  approvedBy: string;

  @Column({ nullable: true })
  approvedAt: Date;

  @Column()
  changedBy: string;

  @Column({ default: false })
  reverted: boolean;

  @Column({ nullable: true })
  revertedBy: string;

  @Column({ nullable: true })
  revertedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
