// Plantilla de datos de la prueba de GIMNASIO (docs/DISENO-PRUEBA-PUBLICA.md §5). Es la misma carga que se verificó en producción con
// «Gimnasio Demo»: las cifras son conocidas para que el recorrido guiado se pueda comprobar (plan de $500 + IVA 16 % = $580).
// Todo se crea SIEMPRE dentro del tenant recibido; nunca se lee ni se escribe fuera de él.

import { generarNipSocio } from './prueba-publica.util';

export const PLANTILLA_GIMNASIO = {
  configuracion: {
    posCapabilities: { membresias: true, venta_de_servicio: true },
    ivaTasaDefault: '16',
    preciosIncluyenIva: false,
    stockPolicy: 'PERMITIR_NEGATIVO',
  },
  categorias: ['Bebidas', 'Servicios'],
  productos: [
    { nombre: 'Agua 600 ml', precio: 20, categoria: 'Bebidas', servicio: false },
    { nombre: 'Isotónica 600 ml', precio: 30, categoria: 'Bebidas', servicio: false },
    { nombre: 'Proteína (batido)', precio: 80, categoria: 'Bebidas', servicio: false },
    { nombre: 'Pase de día', precio: 100, categoria: 'Servicios', servicio: true },
    { nombre: 'Hora de cancha', precio: 300, categoria: 'Servicios', servicio: true },
  ],
  planes: [
    { nombre: 'Mensual', precio: 500, periodoTipo: 'MESES', periodoCantidad: 1, diasCongelacionMax: 7, beneficios: { descuentoPct: 10, notas: ['Acceso a todas las áreas'] } },
    { nombre: 'Anual', precio: 5000, periodoTipo: 'ANOS', periodoCantidad: 1, diasCongelacionMax: 15, beneficios: { descuentoPct: 10, notas: ['Acceso a todas las áreas', 'Un mes de congelamiento'] } },
  ],
  // El NIP del socio NO va aquí: se genera al azar por cada prueba (generarNipSocio) para que no haya uno «de siempre».
  socio: { nombre: 'Socio', apellidos: 'Demostración', telefono: '6860000000' },
  /** Lo que el recorrido guiado puede comprobar. */
  cifrasConocidas: { mensualConIva: 580, anualConIva: 5800, barraAguaX2ConIva: 46.4 },
} as const;

export interface DepsPlantilla {
  configurar(tenantId: string, body: Record<string, unknown>): Promise<unknown>;
  crearCategoria(tenantId: string, data: { name: string; branchId: string }): Promise<{ id: string }>;
  crearProducto(tenantId: string, data: { name: string; price: number; categoryId: string; branchId: string; esServicio: boolean }): Promise<unknown>;
  crearPlan(tenantId: string, plan: Record<string, unknown>): Promise<unknown>;
  crearSocio(tenantId: string, socio: Record<string, unknown>): Promise<unknown>;
}

export interface ResultadoPlantilla {
  categorias: number;
  productos: number;
  planes: number;
  socios: number;
  /** NIP en claro del socio de ejemplo: solo existe en memoria para mostrarlo UNA vez; en la base queda únicamente su HMAC. */
  socioNip: string;
  socioNumero: string;
}

export async function sembrarGimnasio(deps: DepsPlantilla, tenantId: string, branchId: string, nip: string = generarNipSocio()): Promise<ResultadoPlantilla> {
  if (!tenantId || !branchId) throw new Error('La plantilla necesita tenantId y branchId.');
  const P = PLANTILLA_GIMNASIO;
  await deps.configurar(tenantId, { ...P.configuracion, posCapabilities: { ...P.configuracion.posCapabilities } });

  const porNombre = new Map<string, string>();
  for (const nombre of P.categorias) {
    const c = await deps.crearCategoria(tenantId, { name: nombre, branchId });
    porNombre.set(nombre, c.id);
  }
  for (const p of P.productos) {
    await deps.crearProducto(tenantId, { name: p.nombre, price: p.precio, categoryId: porNombre.get(p.categoria) as string, branchId, esServicio: p.servicio });
  }
  for (const plan of P.planes) await deps.crearPlan(tenantId, JSON.parse(JSON.stringify(plan)));
  await deps.crearSocio(tenantId, { ...P.socio, nip });
  // El primer socio de un negocio nuevo recibe el número consecutivo «1».
  return { categorias: P.categorias.length, productos: P.productos.length, planes: P.planes.length, socios: 1, socioNip: nip, socioNumero: '1' };
}
