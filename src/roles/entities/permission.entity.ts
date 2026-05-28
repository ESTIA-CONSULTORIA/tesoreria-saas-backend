import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Role } from './role.entity';

export enum Module {
  DASHBOARD = 'DASHBOARD',
  COMPANIES = 'COMPANIES',
  BRANCHES = 'BRANCHES',
  USERS = 'USERS',
  ROLES = 'ROLES',
  BANKS = 'BANKS',
  MOVEMENTS = 'MOVEMENTS',
  TRANSFERS = 'TRANSFERS',
  REPORTS = 'REPORTS',
  TREASURY = 'TREASURY',
  RECONCILIATION = 'RECONCILIATION',
  ADMINISTRATION = 'ADMINISTRATION',
  SETTINGS = 'SETTINGS',
}

@Entity()
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: Module,
  })
  module: Module;

  @Column({ default: true })
  canView: boolean;

  @Column({ default: false })
  canCreate: boolean;

  @Column({ default: false })
  canEdit: boolean;

  @Column({ default: false })
  canDelete: boolean;

  @ManyToOne(() => Role, (role) => role.permissions)
  role: Role;

  @Column()
  roleId: string;
}
