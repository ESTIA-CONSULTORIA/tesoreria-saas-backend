import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  branchId: string;

  @Column()
  productId: string;

  @Column()
  type: string; // IN, OUT, ADJUSTMENT, SALE, TRANSFER

  @Column({ type: 'decimal', default: 0 })
  quantity: number;

  @Column({ type: 'decimal', default: 0 })
  previousStock: number;

  @Column({ type: 'decimal', default: 0 })
  newStock: number;

  @Column({ nullable: true })
  referenceType: string; // SALE, PURCHASE, TRANSFER

  @Column({ nullable: true })
  referenceId: string;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
