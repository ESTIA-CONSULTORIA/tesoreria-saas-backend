import { EntityManager } from 'typeorm';
import { Insumo } from './entities/insumo.entity';

// Ronda de seguimiento (arquitectura, decisión de Miguel confirmada): esta caminata de
// reemplazadoPorId (con detección de ciclos) vivía TRIPLICADA — costs.service.ts::
// costoUnitarioInsumo(), sales.service.ts::resolveActiveInsumo() y products.service.ts::
// resolveActiveInsumoSafe() — cada una con su propia copia del mismo algoritmo. La
// duplicación se justificó dos veces por separado: (a) evitar acoplar pos/ y costs/ por una
// función de ~15 líneas (no vale la pena un import de módulo Nest ni el riesgo de dependencia
// circular por esto), y (b) en ventas, poder leer con el EntityManager transaccional activo
// en vez de this.insumosRepo (el descuento de stock y la venta deben quedar en la misma
// transacción — ver sales.service.ts::create()).
//
// Esta función pura resuelve ambas preocupaciones sin reabrir ninguna: NO es un @Injectable()
// (nada que inyectar, cero edge de módulo Nest entre pos/ y costs/ — se importa como
// cualquier función de TypeScript, igual que un type o una constante), y recibe el manager
// como parámetro explícito — cada caller decide si pasa el manager transaccional activo o uno
// no-transaccional (this.xRepo.manager, equivalente exacto a leer directo por el repo).
//
// Deliberadamente NO lanza ninguna excepción ni loggea nada — cada caller preserva
// exactamente el contrato de error que ya tenía antes de esta unificación:
//   - sales.service.ts::resolveActiveInsumo(): Error (ciclo) / BadRequestException (los otros
//     dos casos) — venta real, el cajero necesita un 400 claro.
//   - costs.service.ts::costoUnitarioInsumo(): Error genérico en los tres casos — cálculo de
//     costos, ya se maneja aparte en sus propios callers.
//   - products.service.ts::resolveActiveInsumoSafe(): nunca lanza, logger.warn() + null — el
//     listado de productos del POS no debe caerse completo por un insumo con la cadena rota.
export type InsumoResolutionResult =
  | { ok: true; insumo: Insumo }
  | { ok: false; reason: 'CYCLE'; insumoId: string; nombre?: string }
  | { ok: false; reason: 'NO_REPLACEMENT'; insumoId: string; nombre?: string }
  | { ok: false; reason: 'REPLACEMENT_MISSING'; insumoId: string; nombre?: string };

export async function resolveActiveInsumoChain(
  manager: EntityManager,
  insumo: Insumo,
  visitados: Set<string> = new Set(),
): Promise<InsumoResolutionResult> {
  if (visitados.has(insumo.id)) {
    return { ok: false, reason: 'CYCLE', insumoId: insumo.id, nombre: insumo.nombre };
  }
  visitados.add(insumo.id);

  if (insumo.isActive) {
    visitados.delete(insumo.id);
    return { ok: true, insumo };
  }

  if (!insumo.reemplazadoPorId) {
    return { ok: false, reason: 'NO_REPLACEMENT', insumoId: insumo.id, nombre: insumo.nombre };
  }

  const siguiente = await manager.findOne(Insumo, { where: { id: insumo.reemplazadoPorId } });
  if (!siguiente) {
    return { ok: false, reason: 'REPLACEMENT_MISSING', insumoId: insumo.reemplazadoPorId, nombre: insumo.nombre };
  }

  const resultado = await resolveActiveInsumoChain(manager, siguiente, visitados);
  visitados.delete(insumo.id);
  return resultado;
}
