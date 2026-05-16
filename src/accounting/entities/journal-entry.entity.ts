import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  companyId: string;

  @Column()
  referenceType: string;

  @Column({ nullable: true })
  referenceId: string;

  @Column()
  entryDate: Date;

  @Column({ nullable: true })
  description: string;

  @Column({ default: 'POSTED' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
