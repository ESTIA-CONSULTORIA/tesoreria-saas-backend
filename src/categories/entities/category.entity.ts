import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: '' })
  code: string;

  @Column({ default: '' })
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: 'EXPENSE' })
  type: string; // INCOME | EXPENSE | TRANSFER

  @Column({ default: 'GENERAL' })
  module: string; // GENERAL | POS | TREASURY | PAYROLL

  @Column({ default: '' })
  color: string; // hex color para UI

  @Column({ default: '' })
  icon: string; // nombre del icono

  @Column({ default: 0 })
  order: number; // orden de aparición en listas

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  isSystem: boolean; // true = no se puede eliminar

  @Column({ nullable: true })
  tenantId: string; // null = categoría global del sistema

  @Column({ nullable: true })
  parentId: string; // para subcategorías

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}