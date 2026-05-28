import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ default: '' })
  legalName: string;

  @Column({ default: '' })
  tradeName: string;

  @Column({ nullable: true })
  taxId: string;

  @Column({ default: 'MXN' })
  baseCurrency: string;

  @Column({ default: true })
  isActive: boolean;
}