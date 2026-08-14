import type { Response } from 'express';

// Centraliza las opciones de las cookies httpOnly de sesión del ERP normal (login,
// portal-login, switch-company, refresh) — set y clear deben usar exactamente las mismas
// opciones de path/domain o el navegador no reconoce la cookie a borrar como la misma que
// puso. app.estiaconsultoria.com y api.estiaconsultoria.com son same-site (mismo eTLD+1,
// solo cambia el subdominio) — SameSite=Lax basta, no hace falta None. Domain se omite a
// propósito: la cookie queda host-only (api.estiaconsultoria.com), que es suficiente porque
// el backend es el único que la pone y el único que la lee.
const isProd = process.env.NODE_ENV === 'production';

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 min — igual que expiresIn del JWT
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días — igual que refresh_tokens.expiresAt

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken?: string | null) {
  res.cookie('access_token', accessToken, { ...baseCookieOptions(), maxAge: ACCESS_TOKEN_MAX_AGE });
  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, { ...baseCookieOptions(), maxAge: REFRESH_TOKEN_MAX_AGE });
  }
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', baseCookieOptions());
  res.clearCookie('refresh_token', baseCookieOptions());
}
