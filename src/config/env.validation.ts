export function validateEnvironment() {
  const requiredEnvs = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_NAME',
  ];

  const missing = requiredEnvs.filter(
    (key) => !process.env[key],
  );

  if (missing.length) {
    throw new Error(
      `Variables de entorno faltantes: ${missing.join(', ')}`,
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.JWT_SECRET
  ) {
    throw new Error(
      'JWT_SECRET es obligatorio en producción',
    );
  }

  const dbPort = Number(process.env.DB_PORT);

  if (Number.isNaN(dbPort) || dbPort <= 0) {
    throw new Error('DB_PORT inválido');
  }
}
