import { PLANTILLA_GIMNASIO, sembrarGimnasio } from './plantilla-gimnasio';
import { dominioDe, esCorreoValido, esDesechable, generarToken, hashCorreo, hashToken, ipDe, normalizarCorreo, slugPrueba, validarPassword } from './prueba-publica.util';
import { GIROS_PRUEBA, MAX_ACTIVAS, MAX_ALTAS_DIA, MAX_POR_IP_HORA, DIAS_PRUEBA, RETENCION_DIAS, pruebaPublicaActiva } from './prueba-publica.config';
import { PruebaPublicaController } from './prueba-publica.controller';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

describe('configuración aprobada', () => {
  it('14 días, topes 50/20/3, retención 30 días y solo gimnasio', () => {
    expect([DIAS_PRUEBA, MAX_ACTIVAS, MAX_ALTAS_DIA, MAX_POR_IP_HORA, RETENCION_DIAS]).toEqual([14, 50, 20, 3, 30]);
    expect([...GIROS_PRUEBA]).toEqual(['gimnasio']);
  });
  it('apagado por defecto', () => {
    const v = process.env.PRUEBA_PUBLICA_ACTIVA;
    delete process.env.PRUEBA_PUBLICA_ACTIVA;
    expect(pruebaPublicaActiva()).toBe(false);
    if (v !== undefined) process.env.PRUEBA_PUBLICA_ACTIVA = v;
  });
});

describe('utilidades', () => {
  it('correo: normaliza, valida y obtiene dominio', () => {
    expect(normalizarCorreo('  Ana@Gym.MX ')).toBe('ana@gym.mx');
    expect(esCorreoValido('ana@gym.mx')).toBe(true);
    for (const malo of ['ana', 'ana@', '@gym.mx', 'a b@gym.mx', 'ana@gym']) expect(esCorreoValido(malo)).toBe(false);
    expect(dominioDe('ana@gym.mx')).toBe('gym.mx');
    expect(esDesechable('Mailinator.com')).toBe(true);
    expect(esDesechable('gmail.com')).toBe(false);
  });

  it('hash del correo: determinista con la sal, distinto con otra sal, y exige sal', () => {
    const a = hashCorreo('ana@gym.mx', 'sal-de-prueba-0123456789');
    expect(a).toBe(hashCorreo('ana@gym.mx', 'sal-de-prueba-0123456789'));
    expect(a).not.toBe(hashCorreo('ana@gym.mx', 'otra-sal-de-prueba-0123'));
    expect(a).toHaveLength(64);
    expect(() => hashCorreo('ana@gym.mx', '')).toThrow(/PRUEBA_PUBLICA_SAL/);
    expect(() => hashCorreo('ana@gym.mx', 'corta')).toThrow(/PRUEBA_PUBLICA_SAL/);
  });

  it('token: aleatorio, de 32 bytes, y su hash no es reversible a simple vista', () => {
    const t1 = generarToken();
    expect(t1).not.toBe(generarToken());
    expect(Buffer.from(t1, 'base64url')).toHaveLength(32);
    expect(hashToken(t1)).toHaveLength(64);
    expect(hashToken(t1)).not.toContain(t1);
  });

  it('IP: primer x-forwarded-for, o la del socket', () => {
    expect(ipDe({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }, ip: '9.9.9.9' })).toBe('1.2.3.4');
    expect(ipDe({ headers: {}, ip: '9.9.9.9' })).toBe('9.9.9.9');
    expect(ipDe({})).toBe('desconocida');
  });

  it('contraseña: 10+ con letra y número', () => {
    expect(validarPassword('MiClaveSegura1')).toBeNull();
    for (const mala of ['corta1A', 'soloLetrasLargas', '12345678901', '', undefined]) expect(validarPassword(mala)).not.toBeNull();
  });

  it('slug no adivinable', () => {
    expect(slugPrueba()).toMatch(/^prueba-[0-9a-f]{10}$/);
    expect(slugPrueba()).not.toBe(slugPrueba());
  });
});

describe('plantilla del gimnasio', () => {
  function deps() {
    const llamadas: Array<[string, string, any]> = [];
    let n = 0;
    return {
      llamadas,
      d: {
        configurar: async (t: string, b: any) => void llamadas.push(['configurar', t, b]),
        crearCategoria: async (t: string, c: any) => { llamadas.push(['categoria', t, c]); return { id: `cat-${++n}` }; },
        crearProducto: async (t: string, p: any) => void llamadas.push(['producto', t, p]),
        crearPlan: async (t: string, p: any) => void llamadas.push(['plan', t, p]),
        crearSocio: async (t: string, s: any) => void llamadas.push(['socio', t, s]),
      },
    };
  }

  it('crea lo mismo que «Gimnasio Demo»: 2 categorías, 5 productos, 2 planes, 1 socio con NIP, IVA 16 % sin incluir', async () => {
    const { d, llamadas } = deps();
    expect(await sembrarGimnasio(d, 'T1', 'B1')).toEqual({ categorias: 2, productos: 5, planes: 2, socios: 1 });
    expect(llamadas.find(([o]) => o === 'configurar')![2]).toMatchObject({ ivaTasaDefault: '16', preciosIncluyenIva: false, stockPolicy: 'PERMITIR_NEGATIVO', posCapabilities: { membresias: true, venta_de_servicio: true } });
    const prods = llamadas.filter(([o]) => o === 'producto').map(([, , p]) => [p.name, p.price, p.esServicio]);
    expect(prods).toEqual([['Agua 600 ml', 20, false], ['Isotónica 600 ml', 30, false], ['Proteína (batido)', 80, false], ['Pase de día', 100, true], ['Hora de cancha', 300, true]]);
    expect(llamadas.filter(([o]) => o === 'plan').map(([, , p]) => [p.nombre, p.precio])).toEqual([['Mensual', 500], ['Anual', 5000]]);
    expect(llamadas.find(([o]) => o === 'socio')![2].nip).toMatch(/^\d{4}$/);
  });

  it('cada producto cae en la categoría correcta y siempre en la sucursal recibida', async () => {
    const { d, llamadas } = deps();
    await sembrarGimnasio(d, 'T1', 'B-7');
    const cats = llamadas.filter(([o]) => o === 'categoria');
    expect(cats.map(([, , c]) => c.name)).toEqual(['Bebidas', 'Servicios']);
    const productos = llamadas.filter(([o]) => o === 'producto').map(([, , p]) => p);
    expect(productos.slice(0, 3).every((p) => p.categoryId === 'cat-1')).toBe(true);
    expect(productos.slice(3).every((p) => p.categoryId === 'cat-2')).toBe(true);
    expect(productos.every((p) => p.branchId === 'B-7')).toBe(true);
  });

  it('todo va al tenant recibido y a ningún otro', async () => {
    const { d, llamadas } = deps();
    await sembrarGimnasio(d, 'T-ABC', 'B1');
    expect(new Set(llamadas.map(([, t]) => t))).toEqual(new Set(['T-ABC']));
  });

  it('las cifras conocidas del recorrido salen de los precios (plan $500 + IVA 16 % = $580; 2 aguas = $46.40)', () => {
    const iva = (x: number) => Math.round(x * 1.16 * 100) / 100;
    const P = PLANTILLA_GIMNASIO;
    expect(iva(P.planes[0].precio)).toBe(P.cifrasConocidas.mensualConIva);
    expect(iva(P.planes[1].precio)).toBe(P.cifrasConocidas.anualConIva);
    expect(iva(P.productos[0].precio * 2)).toBe(P.cifrasConocidas.barraAguaX2ConIva);
  });

  it('exige tenant y sucursal', async () => {
    const { d } = deps();
    await expect(sembrarGimnasio(d, '', 'B')).rejects.toThrow();
    await expect(sembrarGimnasio(d, 'T', '')).rejects.toThrow();
  });

  it('es repetible: dos corridas dan exactamente las mismas llamadas', async () => {
    const a = deps(); const b = deps();
    await sembrarGimnasio(a.d, 'T', 'B');
    await sembrarGimnasio(b.d, 'T', 'B');
    expect(JSON.stringify(a.llamadas)).toBe(JSON.stringify(b.llamadas));
  });
});

describe('controlador público', () => {
  const metodos = Object.getOwnPropertyNames(PruebaPublicaController.prototype).filter((n) => n !== 'constructor');

  it('es público y solo expone dos POST: solicitar y activar (ninguna lectura)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PruebaPublicaController)).toBe(true);
    expect(metodos.sort()).toEqual(['activar', 'solicitar']);
    for (const m of metodos) {
      expect(Reflect.getMetadata(METHOD_METADATA, (PruebaPublicaController.prototype as any)[m])).toBe(RequestMethod.POST);
    }
    expect(metodos.map((m) => Reflect.getMetadata(PATH_METADATA, (PruebaPublicaController.prototype as any)[m])).sort()).toEqual(['activar', 'solicitar']);
    expect(Reflect.getMetadata(PATH_METADATA, PruebaPublicaController)).toBe('prueba');
  });
});
