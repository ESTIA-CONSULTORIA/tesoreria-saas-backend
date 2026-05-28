import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  provider: string;

  @Column()
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

  @Column({ nullable: true })
  lastSyncAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}