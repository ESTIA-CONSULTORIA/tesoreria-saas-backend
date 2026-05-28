import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW = 'VIEW',
}

export enum AuditModule {
  USERS = 'USERS',
  ROLES = 'ROLES',
  BANKS = 'BANKS',
  MOVEMENTS = 'MOVEMENTS',
  TRANSFERS = 'TRANSFERS',
  REPORTS = 'REPORTS',
  TREASURY = 'TREASURY',
  RECONCILIATION = 'RECONCILIATION',
  ADMINISTRATION = 'ADMINISTRATION',
  TENANTS = 'TENANTS',
  SETTINGS = 'SETTINGS',
}

@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  userName?: string;

  @Column({ nullable: true })
  userEmail?: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditModule,
  })
  module: AuditModule;

  @Column({ nullable: true })
  entityId?: string;

  @Column({ type: 'json', nullable: true })
  oldValue?: any;

  @Column({ type: 'json', nullable: true })
  newValue?: any;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt: Date;
}
