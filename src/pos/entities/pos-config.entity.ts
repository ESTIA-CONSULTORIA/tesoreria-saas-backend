import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class PosConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  // Parámetros de operación
  @Column({ default: true })
  allowDiscounts: boolean;

  @Column({ default: 10, type: 'decimal', precision: 5, scale: 2 })
  maxDiscountPercentage: number;

  @Column({ default: true })
  allowCompliments: boolean;

  @Column({ default: false })
  complimentRequiresAuth: boolean;

  @Column({ type: 'json', default: '[]' })
  tipPercentages: number[];

  @Column({ default: 'BOTH' })
  paymentMethod: 'CASH' | 'CARD' | 'BOTH';

  @Column({ default: true })
  cancelRequiresAuth: boolean;

  // Hardware - Impresora térmica
  @Column({ default: 'NONE' })
  thermalPrinterType: 'NONE' | 'USB' | 'NETWORK' | 'SERIAL';

  @Column({ nullable: true })
  thermalPrinterIp: string;

  @Column({ nullable: true })
  thermalPrinterPort: string;

  @Column({ nullable: true })
  thermalPrinterModel: string;

  // Hardware - Terminal bancario
  @Column({ default: 'NONE' })
  paymentTerminalProvider: 'NONE' | 'CLIP' | 'GETNET' | 'BANORTE';

  @Column({ nullable: true })
  paymentTerminalAffiliation: string;

  // Hardware - Cajón de dinero
  @Column({ default: false })
  cashDrawerEnabled: boolean;

  @Column({ default: false })
  cashDrawerConnectedToPrinter: boolean;

  // Hardware - Impresora convencional
  @Column({ nullable: true })
  conventionalPrinterName: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
