import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { seedDatabase } from './seed/seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // Timeout de conexión
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      res.status(408).json({ message: 'Request timeout' });
    });
    next();
  });

  // Ejecutar seed después de iniciar la aplicación
  const dataSource = app.get(getDataSourceToken());
  await seedDatabase(dataSource);

  const port = process.env.PORT ?? 3000;
  const host = '0.0.0.0';

  await app.listen(port, host);

  console.log(`Backend corriendo en http://${host}:${port}`);
  console.log(`CORS habilitado para todos los orígenes`);
  console.log(`Timeout de conexión: 30000ms`);
}

bootstrap();