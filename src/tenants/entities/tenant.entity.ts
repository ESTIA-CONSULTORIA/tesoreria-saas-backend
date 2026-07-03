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

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isOnboarded: boolean;

  @CreateDateColumn()
  createdAt: Date;
}