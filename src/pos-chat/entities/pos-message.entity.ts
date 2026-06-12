import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class PosMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  turnoId: string;

  @Column()
  userId: string;

  @Column()
  userName: string;

  @Column({ default: 'CAJERO' })
  role: string; // CAJERO | SUPERVISOR | ADMIN | SOPORTE

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'TEXT' })
  type: string; // TEXT | APPROVAL_REQUEST | APPROVAL | REJECTION

  @CreateDateColumn()
  createdAt: Date;
}
