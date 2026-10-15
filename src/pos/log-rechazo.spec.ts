import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { calcularTotalesIva } from '../config/iva.config';
import { mensajeDeRechazo, registrarRechazo } from './log-rechazo';

describe('registro del rechazo de un cobro', () => {
  const req = { user: { id: 'u1', tenantId: 'T1', roleCode: 'CAJERO' } };
  const data = {
    folio: 'F-1', sucursalId: 's1', total: 10.8, items: [{}],
    formasPago: [{ forma: 'DEBITO', monto: 10.8, ultimos4Digitos: '4242', folioVoucher: 'VOUCHER-SECRETO', claveRastreo: 'CLAVE-SECRETA' }],
  };

  it('deja el mensaje exacto del 400, tenant, usuario y formas con monto; sin dígitos, voucher ni clave', () => {
    const lineas: string[] = [];
    registrarRechazo('POST /pos/sales', new BadRequestException('Forma de pago 1 (DEBITO) requiere los últimos 4 dígitos de la tarjeta (ultimos4Digitos).'), req, data, (m) => lineas.push(m));
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain('[POST /pos/sales] 400 Forma de pago 1 (DEBITO) requiere los últimos 4 dígitos');
    expect(lineas[0]).toContain('tenant=T1 usuario=u1 rol=CAJERO');
    expect(lineas[0]).toContain('formas=[DEBITO:10.8]');
    for (const secreto of ['4242', 'VOUCHER-SECRETO', 'CLAVE-SECRETA']) expect(lineas[0]).not.toContain(secreto);
  });

  it('registra los 403 también y no registra errores que no son 4xx', () => {
    const lineas: string[] = [];
    registrarRechazo('x', new ForbiddenException('no'), req, data, (m) => lineas.push(m));
    registrarRechazo('x', new Error('boom'), req, data, (m) => lineas.push(m));
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain(' 403 no');
  });

  it('mensaje de un 400 con arreglo (ValidationPipe) y con objeto { message }', () => {
    expect(mensajeDeRechazo(new BadRequestException(['a', 'b']))).toBe('a. b');
    expect(mensajeDeRechazo(new BadRequestException({ message: 'diferencia', code: 'X' }))).toBe('diferencia');
  });
});

describe('IVA 8%: el total del servidor nunca queda un centavo arriba de lo que el POS calcula', () => {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  it('para cualquier precio de $0.01 a $999.99, una línea: total = precio + redondeo(precio × 8%)', () => {
    let fallos = 0;
    for (let c = 1; c <= 99999; c++) {
      const p = c / 100;
      const t = calcularTotalesIva([{ monto: p, tasaIva: '8', ivaIncluido: false }]);
      if (t.total !== r2(p + r2(p * 0.08))) fallos++;
    }
    expect(fallos).toBe(0);
  });

  it('Orden de Limón $10.00 → $10.80', () => {
    expect(calcularTotalesIva([{ monto: 10, tasaIva: '8', ivaIncluido: false }])).toMatchObject({ base: 10, impuestos: 0.8, total: 10.8 });
  });
});
