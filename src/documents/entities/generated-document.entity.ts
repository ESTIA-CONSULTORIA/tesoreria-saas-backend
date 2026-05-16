import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class GeneratedDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column({ nullable: true })
  companyId: string;

  @Column()
  templateCode: string;

  @Column()
  documentType: string;

  @Column({ nullable: true })
  referenceId: string;

  @Column({ nullable: true })
  fileName: string;

  @Column({ nullable: true })
  storagePath: string;

  @Column({ nullable: true })
  format: string;

  @Column({ default: 'GENERATED' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
