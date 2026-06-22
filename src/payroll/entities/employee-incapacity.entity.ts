import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class EmployeeIncapacity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  employeeId: string;

  @Column()
  startDate: string; // YYYY-MM-DD

  @Column()
  endDate: string; // YYYY-MM-DD

  @Column({ type: 'int', default: 0 })
  days: number;

  @Column()
  type: string; // CON_RIESGO | SIN_RIESGO

  @Column({ nullable: true })
  imssFileNumber: string;

  @Column({ nullable: true })
  diagnosis: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
