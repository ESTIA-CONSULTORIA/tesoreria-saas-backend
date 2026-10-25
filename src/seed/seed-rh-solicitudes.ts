// Solicitudes de RH de ejemplo del tenant demo. Antes la comprobación de "ya existe" miraba al empleado
// (vacaciones) o la fecha de mañana (permiso): si el empleado se re-creaba/renombraba, o simplemente pasaba un día,
// cada arranque insertaba otra solicitud (62 permisos pendientes de una misma cajera en producción).
// Ahora cada solicitud demo se identifica una sola vez por tenant + motivo (+ rango de fechas, en vacaciones).

interface RepoMinimo {
  findOne(opts: any): Promise<any>;
  save(data: any): Promise<any>;
}

export interface EmpleadoMinimo {
  id: string;
}

export interface SolicitudesRHDemoInput {
  tenantId: string;
  juan?: EmpleadoMinimo | null;
  carlos?: EmpleadoMinimo | null;
  maria?: EmpleadoMinimo | null;
  /** Hoy; inyectable para tests. */
  hoy?: Date;
}

export const MOTIVO_VACACION_JUAN = 'Vacaciones de fin de año';
export const MOTIVO_VACACION_CARLOS = 'Vacaciones enero';
export const MOTIVO_PERMISO_MARIA = 'Cita médica';

/** Devuelve cuántas solicitudes insertó (0 si todas ya existían). */
export async function sembrarSolicitudesRHDemo(
  vacationRepo: RepoMinimo,
  permissionRepo: RepoMinimo,
  { tenantId, juan, carlos, maria, hoy = new Date() }: SolicitudesRHDemoInput,
): Promise<number> {
  let creadas = 0;

  const vacacion = async (emp: EmpleadoMinimo | null | undefined, startDate: string, endDate: string, reason: string, status: string) => {
    if (!emp) return;
    const existe = await vacationRepo.findOne({ where: { tenantId, startDate: startDate as any, reason } });
    if (existe) return;
    await vacationRepo.save({ tenantId, employeeId: emp.id, startDate: startDate as any, endDate: endDate as any, daysRequested: 5, reason, status });
    creadas++;
  };

  await vacacion(juan, '2024-12-15', '2024-12-19', MOTIVO_VACACION_JUAN, 'PENDIENTE');
  await vacacion(carlos, '2025-01-20', '2025-01-24', MOTIVO_VACACION_CARLOS, 'APROBADA');

  if (maria) {
    // Una sola vez por tenant, sin importar la fecha: el permiso demo es un ejemplo, no una agenda diaria.
    const existe = await permissionRepo.findOne({ where: { tenantId, type: 'MEDICO', reason: MOTIVO_PERMISO_MARIA } });
    if (!existe) {
      const manana = new Date(hoy);
      manana.setDate(manana.getDate() + 1);
      await permissionRepo.save({
        tenantId, employeeId: maria.id,
        date: manana.toISOString().split('T')[0] as any, hours: 4, type: 'MEDICO',
        reason: MOTIVO_PERMISO_MARIA, status: 'PENDIENTE',
      });
      creadas++;
    }
  }

  return creadas;
}
