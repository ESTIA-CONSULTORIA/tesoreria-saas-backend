import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, default: '' })
  code: string;

  @Column({ default: '' })
  name: string;

  @Column({ type: 'decimal', default: 0 })
  monthlyPrice: number;

  @Column({ default: 1 })
  maxCompanies: number;

  @Column({ default: 1 })
  maxBranches: number;

  @Column({ default: 1 })
  maxUsers: number;

  @Column({ default: true })
  isActive: boolean;
}