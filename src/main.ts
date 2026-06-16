import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { seedDatabase } from './seed/seed';
import { JwtMiddleware } from './auth/jwt.middleware';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'tenant-id',
      'x-company-id',
      'x-branch-id',
    ],
  });

  // Timeout de conexión
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      res.status(408).json({ message: 'Request timeout' });
    });
    next();
  });

  // JWT Middleware para decodificar el token y asignar usuario a request.user
  const jwtMiddleware = app.get(JwtMiddleware);
  app.use((req, res, next) => jwtMiddleware.use(req, res, next));

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