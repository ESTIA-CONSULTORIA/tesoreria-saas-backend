import { MAX_DIAS_PURGA, RETENCION_DIAS } from '../prueba-publica.config';

// Correos de aviso de fin de prueba (días 25, 28 y 30). Texto plano + HTML; nada de datos sensibles: solo nombre, fecha y enlaces públicos.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Correo de contacto público (el mismo del sitio y de la página de la prueba). */
export const CORREO_CONTACTO_PRUEBA = 'contacto@estiaconsultoria.com';

const fechaLarga = (d: Date): string => new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' }).format(d);

export interface DatosAviso {
  nombre: string;
  /** Día de la prueba del aviso: 25, 28 o 30. */
  dia: number;
  venceEn: Date;
  avisoUrl: string;
}

export function plantillaAviso(p: DatosAviso): { asunto: string; html: string; texto: string } {
  const fecha = fechaLarga(p.venceEn);
  const ultimo = p.dia >= 30;
  const asunto = ultimo ? 'Hoy termina tu prueba de ESTIA' : `Tu prueba de ESTIA termina el ${fecha}`;
  const titular = ultimo
    ? `Tu prueba de ESTIA termina hoy (${fecha}).`
    : `Tu prueba de ESTIA termina el ${fecha}.`;
  const lineas = [
    titular,
    'Si quieres seguir con tu negocio tal como lo dejaste, escríbenos antes de que termine y lo pasamos a un plan.',
    `Contacto: ${CORREO_CONTACTO_PRUEBA}`,
    `Si no contratas un plan, tu negocio de prueba y los datos que capturaste se eliminan dentro de un plazo que no excede de ${MAX_DIAS_PURGA} días contados desde el vencimiento (normalmente a los ${RETENCION_DIAS} días). Conservamos únicamente el registro de que aceptaste el aviso de privacidad.`,
    `Aviso de privacidad: ${p.avisoUrl}`,
  ];
  const texto = [`Hola ${p.nombre},`, '', ...lineas.flatMap((l) => [l, ''])].join('\n').trimEnd();
  const html =
    `<p>Hola ${esc(p.nombre)},</p>` +
    `<p><strong>${esc(titular)}</strong></p>` +
    `<p>Si quieres seguir con tu negocio tal como lo dejaste, escríbenos antes de que termine y lo pasamos a un plan: ` +
    `<a href="mailto:${esc(CORREO_CONTACTO_PRUEBA)}">${esc(CORREO_CONTACTO_PRUEBA)}</a>.</p>` +
    `<p>${esc(lineas[3])}</p>` +
    `<p><a href="${esc(p.avisoUrl)}">Aviso de privacidad</a></p>`;
  return { asunto, html, texto };
}
