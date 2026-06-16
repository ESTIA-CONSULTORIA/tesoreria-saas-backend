import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('biometric_credential')
export class BiometricCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  tenantId: string;

  @Column()
  employeeId: string;

  @Column({ default: 'FACE' })
  type: string; // FACE | WEBAUTHN

  @Column({ type: 'text', nullable: true })
  credentialId: string;

  @Column({ type: 'text', nullable: true })
  publicKey: string;

  @Column({ type: 'text', nullable: true })
  faceDescriptor: string;

  @Column({ nullable: true })
  deviceId: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
