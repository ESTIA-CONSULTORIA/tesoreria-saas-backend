import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class TenantSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  // Identidad
  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true, type: 'text' })
  logoUrl: string;

  @Column({ nullable: true })
  faviconUrl: string;

  @Column({ nullable: true })
  backgroundImage: string;

  @Column({ default: '#2563eb' })
  primaryColor: string;

  @Column({ default: '#64748b' })
  secondaryColor: string;

  @Column({ default: '#0ea5e9' })
  accentColor: string;

  // Tipografía
  @Column({ default: 'Inter' })
  fontFamily: string;

  @Column({ default: 16, type: 'int' })
  fontSize: number;

  // Sidebar
  @Column({ default: '#0f172a' })
  sidebarColor: string;

  @Column({ default: '#e2e8f0' })
  sidebarTextColor: string;

  @Column({ default: '#2563eb' })
  sidebarActiveColor: string;

  @Column({ default: 'normal' })
  sidebarStyle: 'compact' | 'normal' | 'expanded';

  // Botones y controles
  @Column({ default: '#2563eb' })
  primaryButtonColor: string;

  @Column({ default: '#64748b' })
  secondaryButtonColor: string;

  @Column({ default: 'rounded' })
  buttonBorderRadius: 'square' | 'rounded' | 'pill';

  @Column({ nullable: true, type: 'text' })
  customCSS: string;

  // Configuración global (JSON)
  @Column({ type: 'json', nullable: true })
  globalConfig: {
    nombreSistema?: string;
    zonaHoraria?: string;
    monedaDefault?: string;
    formatoFecha?: string;
    limiteSessiones?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
