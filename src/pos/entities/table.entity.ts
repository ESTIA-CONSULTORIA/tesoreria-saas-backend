import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  @Column()
  areaId: string;

  @Column()
  number: number;

  @Column({ default: 4 })
  capacity: number;

  @Column({ default: 'AVAILABLE' })
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DIRTY';

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
