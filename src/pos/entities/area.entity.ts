import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Table } from './table.entity';

@Entity()
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  branchId: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: 0 })
  capacity: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Table, table => table.area)
  tables: Table[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
