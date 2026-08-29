import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  legalName: string;

  @Column({ default: '' })
  tradeName: string;

  @Column({ nullable: true })
  taxId: string;

  @Column({ nullable: true })
  rfc: string;

  @Column({ nullable: true })
  industry: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  slug: string;

  @Column({ default: 'monthly' })
  billingCycle: string;

  @Column({ default: 'BASIC' })
  plan: string;

  // Auditoría de producto (GoodsHabits, Hallazgo 3): giro de negocio del tenant — determina
  // qué módulos verticales puede tener, ADEMÁS de lo que ya permite el plan (ver
  // src/config/module-giro-requirements.config.ts). Distinto del campo "industry" de abajo,
  // que es texto libre sin validar y sin ningún consumidor real en el código — no se reusa
  // porque no encaja con el catálogo cerrado que necesita este mecanismo.
  @Column({ default: 'generico' })
  giro: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isOnboarded: boolean;

  @CreateDateColumn()
  createdAt: Date;
}