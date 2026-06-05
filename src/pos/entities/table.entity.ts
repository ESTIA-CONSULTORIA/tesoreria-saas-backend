import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Area } from './area.entity';

@Entity()
export class Table {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ nullable: true })
  areaId: string;

  @ManyToOne(() => Area, area => area.tables, { nullable: true })
  @JoinColumn({ name: 'areaId' })
  area: Area;

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
