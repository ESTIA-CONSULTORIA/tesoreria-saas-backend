import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('plan_modules')
export class PlanModule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() planCode: string;
  @Column() moduleCode: string;
  @Column({ default: true }) included: boolean;
  @Column({ nullable: true, type: 'jsonb' }) limitsJson: any;
}
