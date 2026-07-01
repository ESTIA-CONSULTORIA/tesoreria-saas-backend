import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('corte_fields')
export class CorteField {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenantId: string;

  @Column()
  key: string;

  @Column()
  label: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  resta: boolean;

  @Column({ default: false })
  isRequired: boolean;

  @Column({ default: 0 })
  order: number;
}
