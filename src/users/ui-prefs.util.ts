import { BadRequestException, ForbiddenException } from '@nestjs/common';

// Preferencias de interfaz POR USUARIO (columna "uiPrefs" jsonb de "user"). Hoy solo la skin.
// Los ids son los de frontend-core/src/core/theme/skins.ts (SKINS): si se agrega una skin allá, se agrega aquí.
export const SKINS_VALIDAS = ['estia', 'oscuro', 'claro', 'contraste'] as const;
export type SkinId = (typeof SKINS_VALIDAS)[number];

/** Skins que todavía no están migradas en todas las pantallas: solo las ven estos roles hasta terminar las olas 2 a 4. */
export const SKINS_EN_PREPARACION: readonly SkinId[] = ['claro', 'contraste'];
export const ROLES_SKINS_EN_PREPARACION: readonly string[] = ['ADMIN', 'SOPORTE'];

export interface UiPrefs {
  skin?: SkinId;
}

export const esSkinId = (v: unknown): v is SkinId => typeof v === 'string' && (SKINS_VALIDAS as readonly string[]).includes(v);

/** ¿Este rol puede elegir/ver `skin`? */
export const puedeUsarSkin = (skin: SkinId, roleCode: string | null | undefined): boolean =>
  !SKINS_EN_PREPARACION.includes(skin) || ROLES_SKINS_EN_PREPARACION.includes(roleCode ?? '');

/**
 * Valida el cuerpo de PUT /auth/me/ui-prefs y devuelve el objeto a guardar. `skin: null` borra la preferencia
 * (el usuario vuelve a la del negocio). Cualquier otra clave se ignora: nunca se guarda lo que no se validó.
 */
export function validarUiPrefs(body: unknown, roleCode: string | null | undefined): UiPrefs {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('skin' in body)) {
    throw new BadRequestException('Indica la skin (o null para usar la del negocio)');
  }
  const skin = (body as { skin: unknown }).skin;
  if (skin === null) return {};
  if (!esSkinId(skin)) throw new BadRequestException('Skin no válida');
  if (!puedeUsarSkin(skin, roleCode)) throw new ForbiddenException('Esta skin todavía no está disponible para tu rol');
  return { skin };
}

/** Lo que se devuelve en login/refresh: una skin en preparación guardada de antes no se entrega a un rol que ya no puede usarla. */
export function uiPrefsVisibles(prefs: UiPrefs | null | undefined, roleCode: string | null | undefined): UiPrefs {
  const skin = prefs?.skin;
  return esSkinId(skin) && puedeUsarSkin(skin, roleCode) ? { skin } : {};
}
