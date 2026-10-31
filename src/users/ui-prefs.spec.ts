import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { puedeUsarSkin, uiPrefsVisibles, validarUiPrefs } from './ui-prefs.util';

describe('preferencias de interfaz por usuario', () => {
  it('acepta las skins visibles para cualquier rol', () => {
    for (const rol of ['ADMIN', 'CAJERO', 'GERENTE', 'MESERO'])
      for (const skin of ['estia', 'oscuro']) expect(validarUiPrefs({ skin }, rol)).toEqual({ skin });
  });

  it('Claro y Alto contraste solo para ADMIN y SOPORTE mientras estén en preparación', () => {
    for (const skin of ['claro', 'contraste', 'isotipo']) {
      expect(validarUiPrefs({ skin }, 'ADMIN')).toEqual({ skin });
      expect(validarUiPrefs({ skin }, 'SOPORTE')).toEqual({ skin });
      for (const rol of ['CAJERO', 'GERENTE', 'USER', null, undefined, ''])
        expect(() => validarUiPrefs({ skin }, rol as any)).toThrow(ForbiddenException);
    }
  });

  it('skin: null borra la preferencia', () => {
    expect(validarUiPrefs({ skin: null }, 'CAJERO')).toEqual({});
  });

  it('rechaza lo que no es una skin y no guarda claves ajenas', () => {
    for (const malo of [{}, null, undefined, [], 'estia', { skin: 'rojo' }, { skin: 1 }, { skin: '' }, { skin: ['estia'] }, { skin: '__proto__' }, { skin: 'toString' }])
      expect(() => validarUiPrefs(malo, 'ADMIN')).toThrow(BadRequestException);
    expect(validarUiPrefs({ skin: 'oscuro', admin: true, roleCode: 'SOPORTE' }, 'CAJERO')).toEqual({ skin: 'oscuro' });
  });

  it('login/refresh no entregan una skin en preparación a un rol que ya no puede usarla', () => {
    expect(uiPrefsVisibles({ skin: 'claro' }, 'ADMIN')).toEqual({ skin: 'claro' });
    expect(uiPrefsVisibles({ skin: 'claro' }, 'CAJERO')).toEqual({});
    expect(uiPrefsVisibles({ skin: 'oscuro' }, 'CAJERO')).toEqual({ skin: 'oscuro' });
    expect(uiPrefsVisibles(null, 'ADMIN')).toEqual({});
    expect(uiPrefsVisibles({ skin: 'basura' as any }, 'ADMIN')).toEqual({});
  });

  it('puedeUsarSkin', () => {
    expect(puedeUsarSkin('estia', 'CAJERO')).toBe(true);
    expect(puedeUsarSkin('contraste', 'CAJERO')).toBe(false);
  });
});
