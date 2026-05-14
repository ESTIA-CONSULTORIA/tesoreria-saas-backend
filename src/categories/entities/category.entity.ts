import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  code: string; // SALE, RENT, PAYROLL

  @Column()
  name: string; // Ventas, Renta, Nómina

  @Column()
  type: string; // INCOME o EXPENSE

  @Column({ default: true })
  isActive: boolean;
}