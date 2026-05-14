import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  legalName: string;

  @Column()
  tradeName: string;

  @Column({ nullable: true })
  taxId: string;

  @Column({ default: 'MXN' })
  baseCurrency: string;

  @Column({ default: true })
  isActive: boolean;
}