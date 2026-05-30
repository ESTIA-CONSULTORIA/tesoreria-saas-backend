import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  // Identidad
  @Column({ nullable: true })
  systemName: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  faviconUrl: string;

  @Column({ nullable: true })
  primaryColor: string;

  @Column({ nullable: true })
  secondaryColor: string;

  @Column({ nullable: true })
  accentColor: string;

  // Tipografía
  @Column({ nullable: true })
  fontFamily: string;

  @Column({ nullable: true, type: 'int' })
  fontSize: number;

  // Sidebar
  @Column({ nullable: true })
  sidebarBgColor: string;

  @Column({ nullable: true })
  sidebarTextColor: string;

  @Column({ nullable: true })
  sidebarActiveColor: string;

  @Column({ nullable: true })
  sidebarStyle: 'compact' | 'normal' | 'expanded';

  // Botones y controles
  @Column({ nullable: true })
  primaryButtonColor: string;

  @Column({ nullable: true })
  secondaryButtonColor: string;

  @Column({ nullable: true })
  buttonBorderRadius: 'square' | 'rounded' | 'pill';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
