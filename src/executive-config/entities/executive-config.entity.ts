import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Config de Vista Ejecutiva (tema + qué de los 9 módulos se muestran) — compartida por
// tenant, no por usuario individual (decisión de negocio confirmada: cualquier
// ADMIN/GERENTE que entre con acceso ejecutivo ve y edita la misma config). Separada de
// TenantSetting a propósito: esa tabla es branding del ERP normal (theme ahí significa
// otra cosa) y es de lectura pública; esta es propia de Vista Ejecutiva y de escritura
// restringida a sesiones con executiveAccess.
@Entity('executive_config')
export class ExecutiveConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tenantId: string;

  @Column({ default: 'dark' })
  theme: string;

  @Column({ type: 'json', nullable: true })
  modules: Record<string, boolean>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
