import { DIAS_PRUEBA, TOKEN_MINUTOS } from '../prueba-publica.config';

// Correo de activación. El token va en el FRAGMENTO (#token=…): no viaja al servidor web ni en el encabezado Referer.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function enlaceActivacion(urlBase: string, token: string): string {
  return `${urlBase.replace(/[#?].*$/, '')}#token=${encodeURIComponent(token)}`;
}

export function plantillaActivacion(p: { nombre: string; enlace: string; avisoUrl: string }): { asunto: string; html: string; texto: string } {
  const asunto = 'Activa tu prueba de ESTIA';
  const texto = [
    `Hola ${p.nombre},`,
    '',
    `Para activar tu prueba de ESTIA (${DIAS_PRUEBA} días) abre este enlace y elige tu contraseña. Es de un solo uso y vence en ${TOKEN_MINUTOS} minutos:`,
    p.enlace,
    '',
    'Si no lo pediste tú, ignora este correo: no se creará nada.',
    `Aviso de privacidad: ${p.avisoUrl}`,
  ].join('\n');
  const html =
    `<p>Hola ${esc(p.nombre)},</p>` +
    `<p>Para activar tu prueba de ESTIA (${DIAS_PRUEBA} días) abre este enlace y elige tu contraseña. Es de un solo uso y vence en ${TOKEN_MINUTOS} minutos:</p>` +
    `<p><a href="${esc(p.enlace)}">Activar mi prueba</a></p>` +
    `<p>Si no lo pediste tú, ignora este correo: no se creará nada.</p>` +
    `<p><a href="${esc(p.avisoUrl)}">Aviso de privacidad</a></p>`;
  return { asunto, html, texto };
}
