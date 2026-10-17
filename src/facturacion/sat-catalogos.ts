// Catálogos SAT mínimos de F0 (los completos —c_ClaveProdServ ~50 mil filas, c_CodigoPostal— se cargan en tabla en una fase
// posterior). Solo lo que se puede validar sin PAC. [VALIDAR con el contador] antes de producción.

export const REGIMENES_FISCALES: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza',
};

export const USOS_CFDI: Record<string, string> = {
  G01: 'Adquisición de mercancías',
  G02: 'Devoluciones, descuentos o bonificaciones',
  G03: 'Gastos en general',
  I01: 'Construcciones',
  I02: 'Mobiliario y equipo de oficina por inversiones',
  I03: 'Equipo de transporte',
  I04: 'Equipo de cómputo y accesorios',
  I05: 'Dados, troqueles, moldes, matrices y herramental',
  I06: 'Comunicaciones telefónicas',
  I07: 'Comunicaciones satelitales',
  I08: 'Otra maquinaria y equipo',
  D01: 'Honorarios médicos, dentales y gastos hospitalarios',
  D02: 'Gastos médicos por incapacidad o discapacidad',
  D03: 'Gastos funerales',
  D04: 'Donativos',
  D05: 'Intereses reales por créditos hipotecarios',
  D06: 'Aportaciones voluntarias al SAR',
  D07: 'Primas por seguros de gastos médicos',
  D08: 'Gastos de transportación escolar obligatoria',
  D09: 'Depósitos en cuentas para el ahorro, planes de pensiones',
  D10: 'Pagos por servicios educativos (colegiaturas)',
  S01: 'Sin efectos fiscales',
  CP01: 'Pagos',
  CN01: 'Nómina',
};

export const OBJETOS_IMPUESTO: Record<string, string> = {
  '01': 'No objeto de impuesto',
  '02': 'Sí objeto de impuesto',
  '03': 'Sí objeto del impuesto y no obligado al desglose',
  '04': 'Sí objeto del impuesto y no causa impuesto',
};

// Subconjunto de c_ClaveUnidad de uso común en restaurante, retail y gimnasio. Otras claves válidas se aceptan por formato.
export const UNIDADES_COMUNES: Record<string, string> = {
  H87: 'Pieza',
  E48: 'Unidad de servicio',
  ACT: 'Actividad',
  KGM: 'Kilogramo',
  GRM: 'Gramo',
  LTR: 'Litro',
  MTR: 'Metro',
  XBX: 'Caja',
  XPK: 'Paquete',
  DAY: 'Día',
  MON: 'Mes',
  ANN: 'Año',
  HUR: 'Hora',
};

export const RFC_GENERICO_NACIONAL = 'XAXX010101000';
export const RFC_GENERICO_EXTRANJERO = 'XEXX010101000';
export const NOMBRE_PUBLICO_GENERAL = 'PUBLICO EN GENERAL';
