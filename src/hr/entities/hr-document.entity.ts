import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class HrDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @Column()
  tipo: string; // INE | CURP | NSS | CONTRATO | COMPROBANTE_DOMICILIO | ACTA_NACIMIENTO | FOTO | OTRO

  @Column({ nullable: true })
  nombre: string;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true, type: 'text' })
  fileData: string;

  @Column({ nullable: true })
  notas: string;

  @Column({ type: 'jsonb', nullable: true })
  ocrExtracted: Record<string, any>;

  @Column({ default: false })
  ocrConfirmed: boolean;

  @CreateDateColumn()
  uploadedAt: Date;
}
