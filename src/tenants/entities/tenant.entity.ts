import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column({ default: 'BASIC' })
  plan: string; // BASIC, PROFESIONAL, BUSINESS, ENTERPRISE

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isOnboarded: boolean;
}