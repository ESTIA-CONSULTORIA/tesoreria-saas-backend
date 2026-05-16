import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class JournalEntryLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  journalEntryId: string;

  @Column()
  chartAccountId: string;

  @Column({ type: 'decimal', default: 0 })
  debit: number;

  @Column({ type: 'decimal', default: 0 })
  credit: number;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
