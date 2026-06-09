import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ default: '' })
  password: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  roleId: string;

  @Column({ default: 'USER' })
  roleCode: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ default: true })
  isActive: boolean;
}