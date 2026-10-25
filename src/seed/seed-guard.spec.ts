import { planDeSeed } from './seed-guard';

describe('planDeSeed', () => {
  it('desarrollo/test: siembra la demo completa', () => {
    expect(planDeSeed({})).toBe('demo-completo');
    expect(planDeSeed({ NODE_ENV: 'development' })).toBe('demo-completo');
  });

  it('NODE_ENV=production sin bandera: solo catálogos', () => {
    expect(planDeSeed({ NODE_ENV: 'production' })).toBe('solo-catalogos');
    expect(planDeSeed({ NODE_ENV: ' Production ' })).toBe('solo-catalogos');
  });

  it('Railway sin NODE_ENV pero con ambiente production: solo catálogos', () => {
    expect(planDeSeed({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe('solo-catalogos');
  });

  it('producción con SEED_DEMO_EN_PRODUCCION=true: demo completa; cualquier otro valor no cuenta', () => {
    expect(planDeSeed({ NODE_ENV: 'production', SEED_DEMO_EN_PRODUCCION: 'true' })).toBe('demo-completo');
    expect(planDeSeed({ NODE_ENV: 'production', SEED_DEMO_EN_PRODUCCION: 'TRUE ' })).toBe('demo-completo');
    for (const v of ['1', 'yes', 'false', '']) {
      expect(planDeSeed({ NODE_ENV: 'production', SEED_DEMO_EN_PRODUCCION: v })).toBe('solo-catalogos');
    }
  });

  it('la bandera sola no cambia nada fuera de producción', () => {
    expect(planDeSeed({ SEED_DEMO_EN_PRODUCCION: 'false' })).toBe('demo-completo');
  });
});
