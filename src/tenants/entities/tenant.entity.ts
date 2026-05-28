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

  @Column({ default: true })
  isActive: boolean;
}