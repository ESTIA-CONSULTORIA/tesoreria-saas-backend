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
  POS = 'POS',
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
    nullable: true,
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

  @Column({
    type: 'json',
    nullable: true,
    default: null,
  })
  subPermissions: string[] | null;

  @ManyToOne(() => Role, (role) => role.permissions)
  role: Role;

  @Column({ nullable: true })
  roleId: string;
}
