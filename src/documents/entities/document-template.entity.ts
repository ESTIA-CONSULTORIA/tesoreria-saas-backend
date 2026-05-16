import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class DocumentTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column({ default: 'PDF' })
  outputFormat: string;

  @Column({ type: 'jsonb', nullable: true })
  layout: any;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
