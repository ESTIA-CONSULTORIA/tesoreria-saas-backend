import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity()
export class TenantSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ default: '#2563eb' })
  primaryColor: string;

  @Column({ default: '#0f172a' })
  sidebarColor: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
