// Giros de la prueba pública: cuáles se ofrecen, por qué se excluyen los demás y qué lleva cada negocio de prueba al nacer.
// Un negocio de prueba nace VACÍO salvo lo estructural (giro, módulos del plan PRUEBA, capacidades del giro, IVA 16 % sin incluir, empresa,
// sucursal, ADMIN y tope de 5 usuarios). Los datos de ejemplo son opcionales: los carga el ADMIN desde la guía (POST /prueba/datos-ejemplo).
import { GIROS, type Giro } from '../config/giros.config';
import { moduleAllowedForGiro } from '../config/module-giro-requirements.config';

/** Giros cuyo alta funciona de punta a punta con el plan PRUEBA: el negocio nace con lo que el giro necesita para venderse y cobrarse. */
export const GIROS_OFRECIDOS = ['gimnasio', 'restaurante', 'retail', 'generico'] as const satisfies readonly Giro[];
export type GiroOfrecido = (typeof GIROS_OFRECIDOS)[number];

/** Giros del catálogo (giros.config) que NO se ofrecen en la prueba, con el motivo. Cada giro del catálogo está en una lista o en la otra (spec). */
export const GIROS_EXCLUIDOS: Readonly<Partial<Record<Giro, string>>> = {
  medico_dental: 'Su módulo vertical (pacientes) no está en el plan PRUEBA: el negocio nacería sin lo que define al giro, y además manejaría datos de salud, que exigen un aviso de privacidad propio.',
  medico_general: 'Su módulo vertical (pacientes) no está en el plan PRUEBA: el negocio nacería sin lo que define al giro, y además manejaría datos de salud, que exigen un aviso de privacidad propio.',
};

/** Módulos que incluye el plan PRUEBA (plan_modules del SQL PP0). Sirve para comprobar, por giro, qué módulos recibe el negocio al nacer. */
export const MODULOS_PLAN_PRUEBA = ['dashboard', 'usuarios', 'empresas', 'sucursales', 'configuracion', 'pos', 'configuracion_pos', 'reportes', 'membresias'] as const;

/** Módulos que recibe un negocio de prueba de ese giro: los del plan que el giro permite (membresías solo para gimnasio). */
export const modulosDeGiro = (giro: string): string[] => MODULOS_PLAN_PRUEBA.filter((m) => moduleAllowedForGiro(m, giro));

/** Configuración estructural que recibe TODO negocio de prueba al activarse (TenantSettingsService.upsert). Sin datos de ejemplo. */
export interface ConfigEstructural {
  posCapabilities: Record<string, boolean>;
  ivaTasaDefault: '16';
  preciosIncluyenIva: false;
  stockPolicy: 'PERMITIR_NEGATIVO';
}

/** Capacidades del POS por giro (pos-capabilities.config): lo que cada giro necesita para operar; el resto queda en su valor por defecto. */
const CAPACIDADES: Record<GiroOfrecido, Record<string, boolean>> = {
  gimnasio: { membresias: true, venta_de_servicio: true },
  restaurante: { mesas_cuenta_abierta: true, notas_cocina_barra: true },
  retail: { venta_directa_producto: true },
  generico: { venta_directa_producto: true },
};

export function configEstructural(giro: string): ConfigEstructural {
  if (!(GIROS_OFRECIDOS as readonly string[]).includes(giro)) throw new Error(`El giro ${giro} no se ofrece en la prueba`);
  return {
    posCapabilities: { ...CAPACIDADES[giro as GiroOfrecido] },
    ivaTasaDefault: '16',
    preciosIncluyenIva: false,
    stockPolicy: 'PERMITIR_NEGATIVO',
  };
}

/** Todo giro del catálogo debe estar clasificado: ofrecido o excluido con motivo (el spec lo vigila para que un giro nuevo no quede a medias). */
export const girosSinClasificar = (): string[] =>
  GIROS.filter((g) => !(GIROS_OFRECIDOS as readonly string[]).includes(g) && !GIROS_EXCLUIDOS[g]);

// ── plantillas mínimas de datos de ejemplo (el gimnasio tiene la suya en plantilla-gimnasio.ts) ──
export interface ProductoEjemplo { nombre: string; precio: number; categoria: string; servicio?: boolean }
export interface PlantillaMinima { categorias: string[]; productos: ProductoEjemplo[] }

export const PLANTILLAS_MINIMAS: Record<Exclude<GiroOfrecido, 'gimnasio'>, PlantillaMinima> = {
  restaurante: {
    categorias: ['Platillos', 'Bebidas', 'Postres'],
    productos: [
      { nombre: 'Hamburguesa', precio: 120, categoria: 'Platillos' },
      { nombre: 'Tacos (orden)', precio: 90, categoria: 'Platillos' },
      { nombre: 'Ensalada de la casa', precio: 85, categoria: 'Platillos' },
      { nombre: 'Refresco', precio: 35, categoria: 'Bebidas' },
      { nombre: 'Agua fresca', precio: 30, categoria: 'Bebidas' },
      { nombre: 'Café americano', precio: 40, categoria: 'Bebidas' },
      { nombre: 'Pastel de chocolate', precio: 65, categoria: 'Postres' },
    ],
  },
  retail: {
    categorias: ['Abarrotes', 'Bebidas', 'Botanas'],
    productos: [
      { nombre: 'Leche 1 L', precio: 28, categoria: 'Abarrotes' },
      { nombre: 'Arroz 1 kg', precio: 32, categoria: 'Abarrotes' },
      { nombre: 'Aceite 1 L', precio: 58, categoria: 'Abarrotes' },
      { nombre: 'Refresco 600 ml', precio: 22, categoria: 'Bebidas' },
      { nombre: 'Agua 1 L', precio: 15, categoria: 'Bebidas' },
      { nombre: 'Papas fritas', precio: 24, categoria: 'Botanas' },
      { nombre: 'Galletas', precio: 20, categoria: 'Botanas' },
    ],
  },
  generico: {
    categorias: ['Productos', 'Servicios'],
    productos: [
      { nombre: 'Producto de ejemplo A', precio: 50, categoria: 'Productos' },
      { nombre: 'Producto de ejemplo B', precio: 120, categoria: 'Productos' },
      { nombre: 'Producto de ejemplo C', precio: 200, categoria: 'Productos' },
      { nombre: 'Servicio de ejemplo (hora)', precio: 300, categoria: 'Servicios', servicio: true },
      { nombre: 'Servicio de ejemplo (visita)', precio: 450, categoria: 'Servicios', servicio: true },
    ],
  },
};

export interface DepsMinima {
  crearCategoria(tenantId: string, data: { name: string; branchId: string }): Promise<{ id: string }>;
  crearProducto(tenantId: string, data: { name: string; price: number; categoryId: string; branchId: string; esServicio: boolean }): Promise<unknown>;
}

/** Siembra la plantilla mínima del giro SOLO dentro del tenant recibido. */
export async function sembrarMinima(deps: DepsMinima, giro: string, tenantId: string, branchId: string): Promise<{ categorias: number; productos: number }> {
  if (!tenantId || !branchId) throw new Error('La plantilla necesita tenantId y branchId.');
  const p = (PLANTILLAS_MINIMAS as Record<string, PlantillaMinima | undefined>)[giro];
  if (!p) throw new Error(`No hay plantilla mínima para el giro ${giro}`);
  const ids = new Map<string, string>();
  for (const nombre of p.categorias) ids.set(nombre, (await deps.crearCategoria(tenantId, { name: nombre, branchId })).id);
  for (const x of p.productos) {
    await deps.crearProducto(tenantId, { name: x.nombre, price: x.precio, categoryId: ids.get(x.categoria) as string, branchId, esServicio: x.servicio === true });
  }
  return { categorias: p.categorias.length, productos: p.productos.length };
}
