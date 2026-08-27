import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Pedidos de DeliveryHub Pro que llegan para un tenant sin el addon 'delivery' activo
// (tenant_modules). No se convierten en Sale/Bank/Movement — cuarentena total, cero
// impacto financiero/en reportes hasta que SOPORTE los resuelve a mano. El `payload`
// completo del DTO queda guardado para poder re-procesar el pedido tal cual llegó sin
// tener que pedírselo de nuevo a DeliveryHub.
@Entity('delivery_quarantine')
// Mismo criterio de idempotencia que Sale (platform, externalOrderId) — protege contra
// dos webhooks casi simultáneos para el mismo pedido, no solo el findOne() en el service.
@Index(['platform', 'externalOrderId'], { unique: true })
export class DeliveryQuarantine {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() tenantId: string;
  @Column() companyId: string;
  @Column() branchId: string;

  @Column() platform: string;
  @Column() externalOrderId: string;

  @Column({ type: 'jsonb' }) payload: any;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) grossAmount: number;

  // PENDING_REVIEW: recién llegó, esperando resolución.
  // ACTIVATED_AND_PROCESSED: SOPORTE activó el módulo y el pedido ya se convirtió en Sale real.
  // REJECTED: SOPORTE decidió no procesarlo — queda el registro, sin impacto financiero.
  @Column({ default: 'PENDING_REVIEW' })
  status: 'PENDING_REVIEW' | 'ACTIVATED_AND_PROCESSED' | 'REJECTED';

  @CreateDateColumn() receivedAt: Date;
  @Column({ nullable: true }) resolvedAt: Date;
  @Column({ nullable: true }) resolvedBy: string;

  // Se llena solo cuando status pasa a ACTIVATED_AND_PROCESSED — el id de la Sale real
  // que terminó creándose, para poder rastrear el pedido de un lado al otro.
  @Column({ nullable: true }) resultingSaleId: string;
}
