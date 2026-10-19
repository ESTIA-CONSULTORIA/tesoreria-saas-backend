import { GIROS, GIRO_LABELS } from '../config/giros.config';
import { GIROS_OFRECIDOS, GIROS_EXCLUIDOS, MODULOS_PLAN_PRUEBA, PLANTILLAS_MINIMAS, configEstructural, girosSinClasificar, modulosDeGiro, sembrarMinima } from './giros-prueba';
import { GIROS_PRUEBA, GIROS_PROXIMOS } from './prueba-publica.config';

describe('giros de la prueba pública', () => {
  it('todo giro de giros.config está ofrecido o excluido CON motivo (un giro nuevo no queda sin clasificar)', () => {
    expect(girosSinClasificar()).toEqual([]);
    for (const g of GIROS) expect((GIROS_OFRECIDOS as readonly string[]).includes(g) !== (g in GIROS_EXCLUIDOS)).toBe(true);
    for (const motivo of Object.values(GIROS_EXCLUIDOS)) expect((motivo as string).length).toBeGreaterThan(40);
  });

  it('lo ofrecido es gimnasio, restaurante, tienda y genérico; los médicos se excluyen; la config y la prueba coinciden', () => {
    expect([...GIROS_OFRECIDOS]).toEqual(['gimnasio', 'restaurante', 'retail', 'generico']);
    expect(Object.keys(GIROS_EXCLUIDOS).sort()).toEqual(['medico_dental', 'medico_general']);
    expect([...GIROS_PRUEBA]).toEqual([...GIROS_OFRECIDOS]);
  });

  it('la lista de espera (sin usar desde la pantalla) es solo para giros SIN prueba', () => {
    for (const g of GIROS_PROXIMOS) expect((GIROS_PRUEBA as readonly string[]).includes(g)).toBe(false);
  });

  it('«Otro giro» ofrece los giros del catálogo que no tienen tarjeta propia y sí funcionan: solo el genérico (con etiqueta en giros.config)', () => {
    const conTarjeta = ['gimnasio', 'restaurante', 'retail'];
    const otros = GIROS_OFRECIDOS.filter((g) => !conTarjeta.includes(g));
    expect(otros).toEqual(['generico']);
    expect(GIRO_LABELS.generico).toBeTruthy();
  });

  it('módulos por giro: todos reciben caja, usuarios, reportes y configuración; la membresía solo el gimnasio; ninguno recibe pacientes', () => {
    for (const g of GIROS_OFRECIDOS) {
      const m = modulosDeGiro(g);
      for (const base of ['dashboard', 'usuarios', 'empresas', 'sucursales', 'configuracion', 'pos', 'configuracion_pos', 'reportes']) expect(m).toContain(base);
      expect(m.includes('membresias')).toBe(g === 'gimnasio');
      expect(m).not.toContain('pacientes');
    }
    expect(MODULOS_PLAN_PRUEBA).not.toContain('pacientes');
  });

  it('estructura de cada giro: IVA 16 % sin incluir, existencias permisivas y capacidades propias (sin datos)', () => {
    for (const g of GIROS_OFRECIDOS) {
      const c = configEstructural(g);
      expect(c).toMatchObject({ ivaTasaDefault: '16', preciosIncluyenIva: false, stockPolicy: 'PERMITIR_NEGATIVO' });
      expect(Object.keys(c).sort()).toEqual(['ivaTasaDefault', 'posCapabilities', 'preciosIncluyenIva', 'stockPolicy']);
    }
    expect(() => configEstructural('medico_dental')).toThrow();
  });

  it('plantillas mínimas: de 5 a 8 productos, cada producto en una categoría de su plantilla y precios positivos', () => {
    for (const [g, p] of Object.entries(PLANTILLAS_MINIMAS)) {
      expect(p.productos.length).toBeGreaterThanOrEqual(5);
      expect(p.productos.length).toBeLessThanOrEqual(8);
      for (const x of p.productos) {
        expect(p.categorias).toContain(x.categoria);
        expect(x.precio).toBeGreaterThan(0);
      }
      expect(g).not.toBe('gimnasio');
    }
  });

  it('sembrarMinima exige tenant y sucursal, y rechaza giros sin plantilla mínima', async () => {
    const deps = { crearCategoria: jest.fn(async () => ({ id: 'c' })), crearProducto: jest.fn(async () => undefined) };
    await expect(sembrarMinima(deps, 'retail', '', 'b')).rejects.toThrow();
    await expect(sembrarMinima(deps, 'gimnasio', 't', 'b')).rejects.toThrow(/plantilla/);
    await expect(sembrarMinima(deps, 'medico_dental', 't', 'b')).rejects.toThrow(/plantilla/);
    expect(deps.crearProducto).not.toHaveBeenCalled();
  });
});
