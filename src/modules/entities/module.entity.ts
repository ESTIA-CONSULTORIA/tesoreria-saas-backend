import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('modules')
export class Module {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) code: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string;
  @Column({ nullable: true }) category: string;
  @Column({ default: true }) isActive: boolean;
  @Column({ default: false }) isAddon: boolean;
  @Column({ type: 'decimal', default: 0 }) defaultPrice: number;
}
