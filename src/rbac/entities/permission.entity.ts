import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  module: string; // TREASURY, POS, INVENTORY, REPORTS

  @Column()
  action: string; // VIEW, CREATE, UPDATE, DELETE, APPROVE

  @Column()
  code: string; // TREASURY_VIEW, POS_CREATE

  @Column()
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
