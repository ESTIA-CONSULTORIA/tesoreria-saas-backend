import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  fechaNacimiento: Date;

  @Column({ default: 'nuevo' })
  tipo: string;

  @Column({ default: 0 })
  numeroVisitas: number;

  @Column({ nullable: true })
  origen: string;

  @Column({ nullable: true })
  notas: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
