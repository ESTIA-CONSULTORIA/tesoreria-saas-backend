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

  @Column({ nullable: true })
  branchId: string;

  @Column()
  provider: string; // SOFTRESTAURANT, SIERRA, CONTPAQI, MERCADOPAGO, BANK, EXCEL

  @Column()
  type: string; // POS, INVENTORY, ACCOUNTING, PAYMENTS, BANKING, REPORT_UPLOAD

  @Column({ default: 'MANUAL_UPLOAD' })
  connectionMode: string; // API, CSV, EXCEL, SQL, WEBHOOK, MANUAL_UPLOAD

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

  @Column({ default: 'DISCONNECTED' })
  connectionStatus: string; // CONNECTED, DISCONNECTED, ERROR

  @Column({ nullable: true })
  syncFrequency: string; // MANUAL, HOURLY, DAILY, REAL_TIME

  @Column({ nullable: true })
  lastSyncAt: Date;

  @Column({ nullable: true })
  lastError: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
