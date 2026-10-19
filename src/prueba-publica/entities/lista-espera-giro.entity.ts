import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// «Avísame cuando esté listo mi giro» (prueba-publica-lista-espera-migration.sql). Solo guarda la solicitud de aviso: no crea cuenta ni negocio.
// El correo va cifrado (AES-256-GCM; se necesita en claro solo para avisar) + hash con sal para no duplicar, y la prueba del consentimiento
// (fecha/versión/URL del aviso de privacidad) la estampa el servidor.
@Entity('pruebas_lista_espera')
export class ListaEsperaGiro {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  correoHash: string;

  @Column({ type: 'varchar', length: 120 })
  correoDominio: string;

  @Column({ type: 'text' })
  correoCifrado: string;

  @Column({ type: 'varchar', length: 20 })
  giro: string;

  @Column({ type: 'timestamptz' })
  avisoAceptadoEn: Date;

  @Column({ type: 'varchar', length: 40 })
  avisoVersion: string;

  @Column({ type: 'varchar', length: 300 })
  avisoUrl: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  // Se pone cuando ya se le avisó (o pidió que no); NULL = pendiente de avisar.
  @Column({ type: 'timestamptz', nullable: true })
  avisadoEn: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
