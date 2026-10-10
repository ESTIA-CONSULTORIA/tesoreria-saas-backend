// IVA configurable del POS. Sustituye a la tasa fija de 16 % (IVA_TASA) que vivía en roles-pos.config.ts.
//
//  · ivaTasaDefault (por tenant): '16' | '8' | '0' | 'EXENTO'. Default '16'.
//  · preciosIncluyenIva (por tenant): false = el precio del catálogo es SIN IVA y el servidor lo suma (como siempre);
//    true = el precio ya trae el IVA y el servidor lo desglosa. Default false.
//  · Product.tasaIva (opcional, por producto): reemplaza la del tenant. null = usa la del tenant.
//
// Los dos valores del tenant viven en TenantSetting.posCapabilities (JSON existente, sin migración), igual que las políticas:
// una fila sin la clave cae al default, así que todo tenant existente sigue en 16 % sin IVA incluido, exactamente como hoy.
//
// '0' y 'EXENTO' no suman impuesto; se distinguen porque fiscalmente son cosas distintas (tasa 0 % vs exento) y el desglose
// del corte y del ticket las muestra por separado.
export const TASAS_IVA = ['16', '8', '0', 'EXENTO'] as const;
export type TasaIva = typeof TASAS_IVA[number];

export const DEFAULT_TASA_IVA: TasaIva = '16';
export const IVA_KEYS = ['ivaTasaDefault', 'preciosIncluyenIva'] as const;

export interface IvaConfig {
  ivaTasaDefault: TasaIva;
  preciosIncluyenIva: boolean;
}

export const DEFAULT_IVA_CONFIG: IvaConfig = { ivaTasaDefault: DEFAULT_TASA_IVA, preciosIncluyenIva: false };

export const isValidTasaIva = (v: unknown): v is TasaIva => typeof v === 'string' && (TASAS_IVA as readonly string[]).includes(v);

// Tasa como fracción. EXENTO y 0 = 0.
export const tasaNumerica = (t: TasaIva): number => (t === '16' ? 0.16 : t === '8' ? 0.08 : 0);

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Un renglón para el cálculo: `monto` es lo que vale la línea DESPUÉS de su descuento, en las mismas unidades que el precio
// del catálogo (sin IVA si ivaIncluido=false; con IVA si ivaIncluido=true).
export interface LineaIva {
  monto: number;
  tasaIva: TasaIva;
  ivaIncluido: boolean;
}

export interface TotalesIva {
  base: number; // importe sin IVA (después de descuentos)
  impuestos: number;
  total: number; // base + impuestos
  porTasa: Record<TasaIva, { base: number; impuestos: number }>;
}

// Agrupa por (tasa, incluido) y redondea el impuesto UNA vez por grupo (no por línea): con una sola tasa y precios sin IVA da
// exactamente lo de siempre, round2(neto × 16 %). Con precios incluidos: total = suma de los montos; base = round2(total / (1+t));
// impuestos = total − base (así base + impuestos == total sin centavos perdidos).
export function calcularTotalesIva(lineas: LineaIva[]): TotalesIva {
  const grupos = new Map<string, { suma: number; tasaIva: TasaIva; incluido: boolean }>();
  for (const l of lineas) {
    const k = `${l.tasaIva}|${l.ivaIncluido ? 1 : 0}`;
    const g = grupos.get(k) ?? { suma: 0, tasaIva: l.tasaIva, incluido: l.ivaIncluido };
    g.suma = r2(g.suma + l.monto);
    grupos.set(k, g);
  }
  const porTasa = Object.fromEntries(TASAS_IVA.map((t) => [t, { base: 0, impuestos: 0 }])) as TotalesIva['porTasa'];
  let base = 0;
  let impuestos = 0;
  let total = 0;
  for (const g of grupos.values()) {
    const t = tasaNumerica(g.tasaIva);
    let gBase: number;
    let gImp: number;
    if (g.incluido) {
      gBase = r2(g.suma / (1 + t));
      gImp = r2(g.suma - gBase);
    } else {
      gBase = g.suma;
      gImp = r2(g.suma * t);
    }
    porTasa[g.tasaIva].base = r2(porTasa[g.tasaIva].base + gBase);
    porTasa[g.tasaIva].impuestos = r2(porTasa[g.tasaIva].impuestos + gImp);
    base = r2(base + gBase);
    impuestos = r2(impuestos + gImp);
    total = r2(total + gBase + gImp);
  }
  return { base, impuestos, total, porTasa };
}

// Lo que vale una línea ya guardada (SaleItem): precio de catálogo × cantidad − su descuento por ítem. Una línea sin tasa
// guardada es de antes de este cambio: 16 % sin IVA incluido, que era la única regla que existía.
export interface ItemParaIva {
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
  subtotal?: number; // importe de la línea SIN IVA y con su descuento (lo guardado en SaleItem.subtotal)
  tasaIva?: string;
  ivaIncluido?: boolean;
  anulado?: boolean;
}

export const montoDeItem = (it: ItemParaIva): number => {
  const bruto = r2(Number(it.precioUnitario) * Number(it.cantidad));
  const desc = r2((bruto * Number(it.descuento ?? 0)) / 100);
  return r2(bruto - desc);
};

export const lineaIvaDeItem = (it: ItemParaIva): LineaIva => ({
  monto: montoDeItem(it),
  tasaIva: isValidTasaIva(it.tasaIva) ? it.tasaIva : DEFAULT_TASA_IVA,
  ivaIncluido: it.ivaIncluido === true,
});

// Totales de una cuenta a partir de sus ítems vivos (sin descuento de cuenta). subtotal = bruto SIN IVA antes de descuentos
// por ítem; descuento = subtotal − base (el descuento por ítem, en base sin IVA); impuestos y total como en calcularTotalesIva.
export interface TotalesCuenta extends TotalesIva {
  subtotal: number;
  descuento: number;
}

export function totalesDeItems(items: ItemParaIva[]): TotalesCuenta {
  const vivos = (items || []).filter((it) => !it.anulado);
  const t = calcularTotalesIva(vivos.map(lineaIvaDeItem));
  let subtotal = 0;
  for (const it of vivos) {
    const bruto = r2(Number(it.precioUnitario) * Number(it.cantidad));
    const l = lineaIvaDeItem(it);
    subtotal = r2(subtotal + (l.ivaIncluido ? r2(bruto / (1 + tasaNumerica(l.tasaIva))) : bruto));
  }
  return { ...t, subtotal, descuento: r2(subtotal - t.base) };
}

// Lo que pesa una línea en el cobro de la cuenta y al quitarla: su importe SIN IVA guardado × (1 + tasa de la línea), es decir
// lo que cuesta CON IVA. Con una sola tasa el reparto es el mismo de siempre; con tasas distintas (o IVA incluido) cada
// línea pesa lo suyo. pesoImpuestoDeItem es la parte de IVA de esa línea (para repartir el impuesto de la cuenta).
const tasaDeItem = (it: ItemParaIva): number => tasaNumerica(isValidTasaIva(it.tasaIva) ? it.tasaIva : DEFAULT_TASA_IVA);
export const pesoDeItem = (it: ItemParaIva): number => (Number(it.subtotal) || 0) * (1 + tasaDeItem(it));
export const pesoImpuestoDeItem = (it: ItemParaIva): number => (Number(it.subtotal) || 0) * tasaDeItem(it);
