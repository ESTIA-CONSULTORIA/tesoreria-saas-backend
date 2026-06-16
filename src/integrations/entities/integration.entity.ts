import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('integration')
@Unique(['tenantId', 'slug'])
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column({ default: '' })
  slug: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: 'DISCONNECTED' })
  status: string;

  @Column({ type: 'text', nullable: true })
  credentials: string;

  @Column({ type: 'text', nullable: true })
  config: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSync: Date;

  // Legacy fields — kept nullable so existing rows don't break
  @Column({ nullable: true })
  provider: string;

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  baseUrl: string;

  @Column({ nullable: true })
  apiKey: string;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: false })
  syncEnabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
