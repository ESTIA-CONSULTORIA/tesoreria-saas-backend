import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class PayrollConceptTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  employeeId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ default: false })
  isGlobal: boolean;

  @Column()
  name: string;

  @Column()
  type: string; // P | D

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  defaultAmount: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  category: string; // SALARIO | TIEMPO_EXTRA | SEPTIMO_DIA | BONO | DEDUCCION_FALTA | PRESTAMO | OTRO

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
