import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class FamiliaInsumo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  nombre: string;

  @Column({ default: '' })
  prefijo: string;

  @Column({ nullable: true })
  descripcion: string;

  @Column({ default: '#64748B' })
  color: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  tenantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
