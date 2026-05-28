import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  fromAccountId: string;

  @Column({ nullable: true })
  toAccountId: string;

  @Column('decimal', { default: 0 })
  amount: number;

  @Column({ nullable: true })
  concept: string;

  @CreateDateColumn()
  createdAt: Date;
}