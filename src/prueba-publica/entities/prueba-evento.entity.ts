import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

// Bitácora de la prueba pública (prueba-publica-pp3-migration.sql): un registro por prueba y tipo de evento (AVISO_25 / AVISO_28 / AVISO_30). Sirve
// para que los correos de aviso sean idempotentes de forma DURABLE (la clave de idempotencia del proveedor solo dura su ventana). Sin datos personales.
// Tabla propia: si aún no existe, solo los avisos se detienen (no se envía nada sin poder registrarlo); el resto de la prueba no se entera.
@Entity('pruebas_eventos')
@Unique('UQ_pruebas_eventos_prueba_tipo', ['pruebaId', 'tipo'])
export class PruebaEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  pruebaId: string;

  @Column({ type: 'varchar', length: 20 })
  tipo: string;

  // ENVIANDO (reservado, aún sin confirmar) | ENVIADO | OMITIDO (había uno más reciente que enviar)
  @Column({ type: 'varchar', length: 10 })
  estado: string;

  @CreateDateColumn()
  createdAt: Date;
}
