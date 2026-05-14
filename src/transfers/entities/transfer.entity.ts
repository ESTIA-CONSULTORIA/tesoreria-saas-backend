import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fromAccountId: string;

  @Column()
  toAccountId: string;

  @Column('decimal')
  amount: number;

  @Column({ nullable: true })
  concept: string;

  @CreateDateColumn()
  createdAt: Date;
}