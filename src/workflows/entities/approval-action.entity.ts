import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class ApprovalAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  approvalRequestId: string;

  @Column()
  userId: string;

  @Column()
  action: string;

  @Column({ nullable: true })
  comments: string;

  @CreateDateColumn()
  createdAt: Date;
}
