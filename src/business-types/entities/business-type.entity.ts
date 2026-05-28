import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class BusinessType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, default: '' })
  code: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: false })
  allowPOS: boolean;

  @Column({ default: false })
  allowInventory: boolean;

  @Column({ default: false })
  allowTables: boolean;

  @Column({ default: false })
  allowMemberships: boolean;

  @Column({ default: false })
  allowReservations: boolean;

  @Column({ default: false })
  allowBilling: boolean;

  @Column({ default: true })
  isActive: boolean;
}