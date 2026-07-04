import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tenant_modules')
export class TenantModule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() tenantId: string;
  @Column() moduleCode: string;
  @Column({ default: 'plan_base' }) source: string;
  @Column({ default: 'active' }) status: string;
  @Column({ type: 'decimal', default: 0 }) price: number;
  @Column({ nullable: true }) activatedBy: string | null;
  @Column({ nullable: true }) expiresAt: Date;
  @Column({ nullable: true }) notes: string;
  @CreateDateColumn() activatedAt: Date;
}
