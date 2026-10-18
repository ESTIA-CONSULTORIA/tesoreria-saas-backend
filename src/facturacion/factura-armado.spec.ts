import { armarCfdiDesdeVenta, armarNotaCredito, TOLERANCIA_REDONDEO, type DatosArmado, type VentaParaFactura } from './factura-armado';

const claves = (extra: Partial<{ claveProdServ: string; objetoImp: string }> = {}) => ({ claveProdServ: '50202301', claveUnidad: 'H87', unidadNombre: 'Pieza', objetoImp: '02', ...extra });

function venta(over: Partial<VentaParaFactura> = {}): VentaParaFactura {
  return {
    id: 'v1',
    folio: 'VTA-1',
    status: 'PAGADA',
    items: [
      { productoId: 'p-agua', nombre: 'Agua 600 ml', cantidad: 2, precioUnitario: 20, descuento: 0, subtotal: 40, tasaIva: '16' },
      { productoId: 'p-pase', nombre: 'Pase de día', cantidad: 1, precioUnitario: 100, descuento: 0, subtotal: 100, tasaIva: '16' },
    ],
    subtotal: 140,
    impuestos: 22.4,
    total: 162.4,
    formaPago: 'EFECTIVO',
    formasPago: [{ forma: 'EFECTIVO', monto: 162.4 }],
    ...over,
  };
}

function datos(over: Partial<DatosArmado> = {}): DatosArmado {
  return {
    venta: venta(),
    emisor: { rfc: 'EKU9003173C9', nombreFiscal: 'ESCUELA KEMPER URGATE', regimenFiscal: '601' },
    codigoPostalExpedicion: '21000',
    receptor: { rfc: 'XIQB891116QE4', nombreFiscal: 'BERTHA XIMENEZ QUINTERO', codigoPostal: '21000', regimenFiscal: '612' },
    usoCfdi: 'G03',
    productos: new Map([
      ['p-agua', claves()],
      ['p-pase', claves({ claveProdServ: '80141600' })],
    ]),
    serie: 'A',
    folio: 7,
    ...over,
  };
}

describe('armarCfdiDesdeVenta', () => {
  it('venta simple con IVA 16 %: un concepto por partida, traslados por concepto y totales que cuadran con el ticket', () => {
    const r = armarCfdiDesdeVenta(datos());
    expect(r.errores).toEqual([]);
    const e = r.entrada!;
    expect(e).toMatchObject({ tipo: 'I', moneda: 'MXN', exportacion: '01', metodoPago: 'PUE', formaPago: '01', lugarExpedicion: '21000', serie: 'A', folio: '7' });
    expect(e.conceptos).toHaveLength(2);
    expect(e.conceptos[0]).toMatchObject({ descripcion: 'Agua 600 ml', cantidad: 2, valorUnitario: 20, importe: 40, claveProdServ: '50202301', objetoImp: '02' });
    expect(e.conceptos[0].traslados).toEqual([{ impuesto: '002', tipoFactor: 'Tasa', tasa: 0.16, base: 40, importe: 6.4 }]);
    expect([e.subtotal, e.total]).toEqual([140, 162.4]);
    expect(e.receptor.usoCfdi).toBe('G03');
    expect(r.diferenciaCentavos).toBe(0);
  });

  it('IVA 8 %, 0 % y exento se distinguen en el traslado', () => {
    const items = [
      { productoId: 'p-agua', nombre: 'A', cantidad: 1, precioUnitario: 100, descuento: 0, subtotal: 100, tasaIva: '8' },
      { productoId: 'p-agua', nombre: 'B', cantidad: 1, precioUnitario: 100, descuento: 0, subtotal: 100, tasaIva: '0' },
      { productoId: 'p-pase', nombre: 'C', cantidad: 1, precioUnitario: 100, descuento: 0, subtotal: 100, tasaIva: 'EXENTO' },
    ];
    const r = armarCfdiDesdeVenta(datos({ venta: venta({ items, subtotal: 300, impuestos: 8, total: 308 }) }));
    expect(r.errores).toEqual([]);
    const [a, b, c] = r.entrada!.conceptos;
    expect(a.traslados![0]).toMatchObject({ tipoFactor: 'Tasa', tasa: 0.08, importe: 8 });
    expect(b.traslados![0]).toMatchObject({ tipoFactor: 'Tasa', tasa: 0, importe: 0 });
    expect(c.traslados![0]).toEqual({ impuesto: '002', tipoFactor: 'Exento', base: 100 });
    expect(r.entrada!.total).toBe(308);
  });

  it('una partida sin tasa guardada (venta antigua) se toma como 16 %', () => {
    const items = [{ productoId: 'p-agua', nombre: 'A', cantidad: 1, precioUnitario: 100, descuento: 0, subtotal: 100 }];
    const r = armarCfdiDesdeVenta(datos({ venta: venta({ items, subtotal: 100, impuestos: 16, total: 116 }) }));
    expect(r.entrada!.total).toBe(116);
  });

  it('sin claves SAT no se factura y dice de qué productos faltan', () => {
    const r = armarCfdiDesdeVenta(datos({ productos: new Map([['p-agua', claves()]]) }));
    expect(r.entrada).toBeUndefined();
    expect(r.errores.join(' ')).toMatch(/Falta la clave SAT .* de: Pase de día\./);
  });

  it('venta no pagada, con cortesía o a público en general: no se factura', () => {
    expect(armarCfdiDesdeVenta(datos({ venta: venta({ status: 'ABIERTA' }) })).errores.join(' ')).toMatch(/no está pagada/);
    expect(armarCfdiDesdeVenta(datos({ venta: venta({ formasPago: [{ forma: 'CORTESIA', monto: 162.4 }] }) })).errores.join(' ')).toMatch(/cortesía/);
    expect(armarCfdiDesdeVenta(datos({ receptor: { rfc: 'XAXX010101000', nombreFiscal: 'PUBLICO EN GENERAL', codigoPostal: '21000', regimenFiscal: '616' } })).errores.join(' ')).toMatch(/público en general/);
  });

  it('pago mixto: usa la forma de mayor monto y avisa', () => {
    const r = armarCfdiDesdeVenta(datos({ venta: venta({ formasPago: [{ forma: 'EFECTIVO', monto: 60 }, { forma: 'DEBITO', monto: 102.4 }] }) }));
    expect(r.entrada!.formaPago).toBe('28');
    expect(r.advertencias.join(' ')).toMatch(/Pago mixto/);
  });

  it('el IVA por concepto puede diferir centavos del ticket: manda el comprobante y se avisa', () => {
    const items = [
      { productoId: 'p-agua', nombre: 'A', cantidad: 1, precioUnitario: 0.33, descuento: 0, subtotal: 0.33, tasaIva: '16' },
      { productoId: 'p-agua', nombre: 'B', cantidad: 1, precioUnitario: 0.33, descuento: 0, subtotal: 0.33, tasaIva: '16' },
      { productoId: 'p-agua', nombre: 'C', cantidad: 1, precioUnitario: 0.33, descuento: 0, subtotal: 0.33, tasaIva: '16' },
    ];
    // por grupo: 0.99 × 1.16 = 1.1484 → 1.15; por concepto: 3 × (0.33 + 0.05) = 1.14
    const r = armarCfdiDesdeVenta(datos({ venta: venta({ items, subtotal: 0.99, impuestos: 0.16, total: 1.15 }) }));
    expect(r.errores).toEqual([]);
    expect(r.entrada!.total).toBe(1.14);
    expect(r.diferenciaCentavos).toBe(-0.01);
    expect(r.advertencias.join(' ')).toMatch(/redondeo/);
  });

  it('si el total no cuadra por más de la tolerancia, se rechaza', () => {
    expect(TOLERANCIA_REDONDEO).toBe(0.05);
    const r = armarCfdiDesdeVenta(datos({ venta: venta({ total: 170 }) }));
    expect(r.errores.join(' ')).toMatch(/no cuadra/);
  });

  it('un descuento general (subtotal de la venta ≠ suma de partidas) se rechaza', () => {
    const r = armarCfdiDesdeVenta(datos({ venta: venta({ subtotal: 126, total: 146.16, impuestos: 20.16 }) }));
    expect(r.errores.join(' ')).toMatch(/descuento o ajuste general/);
  });

  it('«no objeto de impuesto» con IVA cobrado es inconsistente', () => {
    const r = armarCfdiDesdeVenta(datos({ productos: new Map([['p-agua', claves({ objetoImp: '01' })], ['p-pase', claves()]]) }));
    expect(r.errores.join(' ')).toMatch(/no objeto de impuesto/);
  });

  it('partidas anuladas no entran', () => {
    const v = venta();
    v.items.push({ productoId: 'p-agua', nombre: 'Anulada', cantidad: 1, precioUnitario: 5, descuento: 0, subtotal: 5, tasaIva: '16', anulado: true });
    expect(armarCfdiDesdeVenta(datos({ venta: v })).entrada!.conceptos).toHaveLength(2);
  });
});

describe('armarNotaCredito', () => {
  const original = armarCfdiDesdeVenta(datos()).entrada!;

  it('acredita toda la factura: egreso, relación 01 con el UUID original y uso G02', () => {
    const r = armarNotaCredito({ original, uuidOriginal: 'UUID-ORIG', indices: [], yaAcreditados: [], serie: 'NC', folio: 3 });
    expect(r.errores).toEqual([]);
    const e = r.entrada!;
    expect(e).toMatchObject({ tipo: 'E', serie: 'NC', folio: '3', subtotal: 140, total: 162.4 });
    expect(e.uuidRelacionados).toEqual({ tipoRelacion: '01', uuids: ['UUID-ORIG'] });
    expect(e.receptor.usoCfdi).toBe('G02');
    expect(e.conceptos).toHaveLength(2);
  });

  it('acredita solo algunas partidas', () => {
    const e = armarNotaCredito({ original, uuidOriginal: 'U', indices: [1], yaAcreditados: [] }).entrada!;
    expect(e.conceptos.map((c) => c.descripcion)).toEqual(['Pase de día']);
    expect([e.subtotal, e.total]).toEqual([100, 116]);
  });

  it('no deja acreditar dos veces la misma partida ni una inexistente', () => {
    expect(armarNotaCredito({ original, uuidOriginal: 'U', indices: [0], yaAcreditados: [0] }).errores.join(' ')).toMatch(/ya tienen nota/);
    expect(armarNotaCredito({ original, uuidOriginal: 'U', indices: [9], yaAcreditados: [] }).errores.join(' ')).toMatch(/no existe/);
    expect(armarNotaCredito({ original, uuidOriginal: 'U', indices: [], yaAcreditados: [0] }).errores.join(' ')).toMatch(/ya tienen nota/); // «todas» incluye la ya acreditada
  });

  it('no modifica la factura original', () => {
    const copia = JSON.stringify(original);
    armarNotaCredito({ original, uuidOriginal: 'U', indices: [0], yaAcreditados: [] });
    expect(JSON.stringify(original)).toBe(copia);
  });
});
