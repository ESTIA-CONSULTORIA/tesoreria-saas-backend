import type { Response } from 'express';

// Centraliza las opciones de las cookies httpOnly de sesión — ERP normal (login,
// portal-login, switch-company, refresh), Vista Ejecutiva y POS Lite/NIP. set y clear
// deben usar exactamente las mismas opciones de path/domain o el navegador no reconoce
// la cookie a borrar como la misma que puso. app.estiaconsultoria.com y
// api.estiaconsultoria.com son same-site (mismo eTLD+1, solo cambia el subdominio) —
// SameSite=Lax basta, no hace falta None. Domain se omite a propósito: la cookie queda
// host-only (api.estiaconsultoria.com), que es suficiente porque el backend es el único
// que la pone y el único que la lee.
const isProd = process.env.NODE_ENV === 'production';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 min — igual que expiresIn del JWT del ERP normal
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días — igual que refresh_tokens.expiresAt

// Vista Ejecutiva y POS Lite no tienen refresh_token (nunca lo tuvieron, no se agrega
// acá) — sesión de duración fija, igual que ya era antes de esta migración. La cookie es
// solo dónde vive el token, no cambia cuánto dura ni cómo se renueva (no se renueva).
const EXEC_TOKEN_MAX_AGE = 8 * 60 * 60 * 1000; // 8h — igual que expiresIn de executiveLogin
const POS_LITE_TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24h — igual que expiresIn de loginWithNip

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };
}

function setSingleCookie(res: Response, name: string, value: string, maxAge: number) {
  res.cookie(name, value, { ...baseCookieOptions(), maxAge });
}

function clearSingleCookie(res: Response, name: string) {
  res.clearCookie(name, baseCookieOptions());
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken?: string | null) {
  setSingleCookie(res, 'access_token', accessToken, ACCESS_TOKEN_MAX_AGE);
  if (refreshToken) {
    setSingleCookie(res, 'refresh_token', refreshToken, REFRESH_TOKEN_MAX_AGE);
  }
}

export function clearAuthCookies(res: Response) {
  clearSingleCookie(res, 'access_token');
  clearSingleCookie(res, 'refresh_token');
}

// Nombre de cookie distinto del ERP normal a propósito — evita que ambas sesiones se
// pisen entre sí cuando coexisten en el mismo navegador (mismo dominio api.
// estiaconsultoria.com, mismo cookie jar). Ver x-session-scope en jwt.middleware.ts para
// cómo se elige cuál cookie validar en cada request cuando puede haber varias presentes.
export function setExecutiveCookie(res: Response, token: string) {
  setSingleCookie(res, 'exec_access_token', token, EXEC_TOKEN_MAX_AGE);
}

export function clearExecutiveCookie(res: Response) {
  clearSingleCookie(res, 'exec_access_token');
}

export function setPosLiteCookie(res: Response, token: string) {
  setSingleCookie(res, 'pos_access_token', token, POS_LITE_TOKEN_MAX_AGE);
}

export function clearPosLiteCookie(res: Response) {
  clearSingleCookie(res, 'pos_access_token');
}
