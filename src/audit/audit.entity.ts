import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  userEmail: string;

  @Column({ nullable: true })
  roleCode: string;

  @Column()
  tenantId: string;

  @Column()
  action: string; // 'CREATE', 'UPDATE', 'DELETE', 'ACCESS'

  @Column()
  entity: string; // 'User', 'Company', 'Movement', etc.

  @Column({ type: 'json', nullable: true })
  details: any; // Datos adicionales de la operación

  @Column()
  ipAddress: string;

  @Column()
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}
