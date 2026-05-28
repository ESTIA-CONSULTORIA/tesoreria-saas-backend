import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  type: string;

  @Column({ type: 'json', nullable: true })
  payload: any;

  @CreateDateColumn()
  createdAt: Date;
}
