import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  companyId: string;

  @Column({ default: '' })
  code: string;

  @Column({ default: '' })
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ default: true })
  isActive: boolean;
}